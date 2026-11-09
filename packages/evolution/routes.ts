import type { FastifyInstance } from 'fastify';
import type { EvolutionManager } from './manager.ts';
import type { GenerationManager } from '../generation/manager.ts';
import type { SkillBundle } from './model.ts';
const str = { type: 'string', minLength: 1, maxLength: 200 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export function evolutionRoutes(
  app: FastifyInstance,
  manager: EvolutionManager,
  generation: GenerationManager,
) {
  function post<T>(path: string, body: unknown, handler: (id: string, input: T) => unknown) {
    app.post<{ Params: { id: string }; Body: T }>(
      path,
      { schema: { body: body as Record<string, unknown> } },
      async (r) => handler(r.params.id, r.body as T),
    );
  }
  app.get<{ Querystring: { targetId?: string } }>(
    '/api/evolution/state',
    { schema: { querystring: obj({ targetId: str }, []) } },
    async (r) => ({
      records: manager.knowledge.records(r.query.targetId),
      bundles: manager.repository.list('bundle'),
      evaluations: manager.repository.list('evaluation'),
      active: manager.repository
        .list('active')
        .filter((a) => !r.query.targetId || a.targetId === r.query.targetId),
      changes: manager.repository
        .list('skillChange')
        .filter((c) => !r.query.targetId || c.targetId === r.query.targetId),
      jobs: manager.jobs(),
      metrics: manager.metrics(),
    }),
  );
  app.get<{ Params: { id: string } }>('/api/evolution/jobs/:id', async (r) =>
    manager.job(r.params.id),
  );
  app.get<{ Params: { id: string } }>('/api/evolution/knowledge/:id/document', async (r) =>
    manager.knowledge.document(r.params.id),
  );
  post<{ targetId: string }>('/api/evolution/collect', obj({ targetId: str }), (_, b) =>
    manager.collect(b.targetId),
  );
  post('/api/evolution/jobs/:id/cancel', obj({}), (id) => manager.cancel(id));
  post<{
    sourceRecordId: string;
    expectedHash: string;
    classification: import('./model.ts').KnowledgeClass;
    claim: string;
    provenance: 'OBSERVED' | 'INFERRED';
  }>(
    '/api/evolution/knowledge/propose',
    obj({
      sourceRecordId: str,
      expectedHash: digest,
      classification: {
        enum: ['TEMPORARY', 'REPOSITORY', 'PROCEDURE', 'DECISION', 'SKILL_IMPROVEMENT'],
      },
      claim: { ...str, maxLength: 1000 },
      provenance: { enum: ['OBSERVED', 'INFERRED'] },
    }),
    (_, b) => manager.knowledge.proposeObservation(b),
  );
  post<{ expectedHash: string; approve: boolean }>(
    '/api/evolution/knowledge/:id/review',
    obj({ expectedHash: digest, approve: { type: 'boolean' } }),
    (id, b) => manager.knowledge.review(id, b.expectedHash, b.approve),
  );
  post<{ currentHash: string; restoreHash: string }>(
    '/api/evolution/knowledge/:id/restore-document',
    obj({ currentHash: digest, restoreHash: digest }),
    (id, b) => manager.knowledge.restoreDocument(id, b),
  );
  post('/api/evolution/skills/baseline', obj({}), () => manager.skills.baseline());
  post<{ targetId: string; parentId: string }>(
    '/api/evolution/skills/improvement',
    obj({ targetId: str, parentId: str }),
    (_, b) => manager.improvement(b.targetId, b.parentId),
  );
  post<{ targetId: string; expectedHash: string; healthRunIds: string[]; trustExecution: boolean }>(
    '/api/evolution/skills/summarize',
    obj({
      targetId: str,
      expectedHash: digest,
      healthRunIds: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: str },
      trustExecution: { type: 'boolean' },
    }),
    (_, b) => manager.summarize(b),
  );
  post<{
    name: string;
    version: string;
    parentId?: string;
    files: SkillBundle['files'];
    problem: string;
    benefit: string;
    evidence: string[];
  }>(
    '/api/evolution/skills/propose',
    obj(
      {
        name: str,
        version: str,
        parentId: str,
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: obj({ path: str, content: { type: 'string', maxLength: 64000 } }),
        },
        problem: { ...str, maxLength: 2000 },
        benefit: { ...str, maxLength: 2000 },
        evidence: { type: 'array', maxItems: 20, items: str },
      },
      ['name', 'version', 'files', 'problem', 'benefit', 'evidence'],
    ),
    (_, b) => manager.skills.propose(b),
  );
  post<{ expectedHash: string; baselineId?: string; trustExecution: boolean }>(
    '/api/evolution/skills/:id/evaluate',
    obj({ expectedHash: digest, baselineId: str, trustExecution: { type: 'boolean' } }, [
      'expectedHash',
      'trustExecution',
    ]),
    (id, b) => manager.evaluate(id, b),
  );
  post<{ targetId: string; evaluationId: string; rollback: boolean }>(
    '/api/evolution/skills/:id/prepare',
    obj({ targetId: str, evaluationId: str, rollback: { type: 'boolean' } }),
    (id, b) => manager.skills.prepare(b.targetId, id, b.evaluationId, b.rollback),
  );
  post<{ expectedHash: string }>(
    '/api/evolution/skill-changes/:id/apply',
    obj({ expectedHash: digest }),
    (id, b) => manager.skills.apply(id, b.expectedHash),
  );
  post<{ expectedHash: string }>(
    '/api/evolution/skill-changes/:id/reject',
    obj({ expectedHash: digest }),
    (id, b) => manager.skills.reject(id, b.expectedHash),
  );
  post<{ expectedHash: string }>(
    '/api/evolution/skills/:id/reject',
    obj({ expectedHash: digest }),
    (id, b) => manager.skills.rejectBundle(id, b.expectedHash),
  );
  app.get<{ Params: { id: string } }>('/api/evolution/skills/:id/export', async (r) => {
    const b = manager.repository.get('bundle', r.params.id);
    return {
      name: b.name,
      hash: b.hash,
      files: b.files,
      layout: `.agents/skills/${b.name}/`,
      active: false,
      note: 'Portable file bundle. Download/inspect files or explicitly activate in a registered target; export itself grants no installation or execution.',
    };
  });
  app.get('/api/health/state', async () => ({
    runs: manager.health.repository.runs(),
    schedules: manager.health.repository.schedules(),
    scheduling: 'Local process only; no wake-up, cloud monitoring or repository fixes.',
  }));
  app.get<{ Params: { id: string } }>('/api/health/runs/:id', async (r) =>
    manager.health.repository.run(r.params.id),
  );
  post<{ targetId?: string; slowSetupMs: number }>(
    '/api/health/runs',
    obj({ targetId: str, slowSetupMs: { type: 'integer', minimum: 100, maximum: 120000 } }, [
      'slowSetupMs',
    ]),
    (_, b) => manager.health.start(b.targetId, 'MANUAL', b.slowSetupMs),
  );
  post('/api/health/runs/:id/cancel', obj({}), (id) => manager.health.cancel(id));
  post<{ targetId?: string; enabled: boolean; intervalMinutes: number; slowSetupMs: number }>(
    '/api/health/schedule',
    obj(
      {
        targetId: str,
        enabled: { type: 'boolean' },
        intervalMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
        slowSetupMs: { type: 'integer', minimum: 100, maximum: 120000 },
      },
      ['enabled', 'intervalMinutes', 'slowSetupMs'],
    ),
    (_, b) => manager.health.schedule(b),
  );
  post('/api/health/provider-connection', obj({}), () => generation.connectionInfo());
}
