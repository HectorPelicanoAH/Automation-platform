import type { FastifyInstance } from 'fastify';
import type { MaintenanceManager } from './manager.ts';
import type { Diagnosis, Repair, Classification } from './model.ts';
import { relationships } from '../intelligence/relationships.ts';
const str = { type: 'string', minLength: 1, maxLength: 200 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function maintenanceRoutes(app: FastifyInstance, manager: MaintenanceManager) {
  function post<T>(path: string, body: unknown, handler: (id: string, input: T) => unknown) {
    app.post<{ Params: { id: string }; Body: T }>(
      path,
      { schema: { body: body as Record<string, unknown> } },
      async (r) => handler(r.params.id, r.body as T),
    );
  }
  app.get<{ Querystring: { runId?: string } }>(
    '/api/maintenance/state',
    {
      schema: {
        querystring: { type: 'object', properties: { runId: str }, additionalProperties: false },
      },
    },
    async (request) => ({
      diagnoses: manager
        .list<Diagnosis>('diagnosis')
        .filter((d) => !request.query.runId || d.runId === request.query.runId),
      repairs: manager
        .list<Repair>('repair')
        .filter((r) => !request.query.runId || r.originalRunId === request.query.runId)
        .map((r) => manager.repair(r.id)),
    }),
  );
  app.get<{ Params: { id: string } }>('/api/maintenance/repairs/:id', async (r) =>
    manager.repair(r.params.id),
  );
  post('/api/maintenance/runs/:id/diagnose', obj({}), (id) => manager.diagnose(id));
  post<{
    expectedHash: string;
    classification: Classification;
    rationale: string;
    observedEvidence: string;
  }>(
    '/api/maintenance/diagnoses/:id/review',
    obj({
      expectedHash: digest,
      classification: {
        enum: ['LOCATOR_DEFECT', 'PRODUCT_REGRESSION', 'ENVIRONMENT', 'DATA', 'UNKNOWN'],
      },
      rationale: { ...str, maxLength: 4000 },
      observedEvidence: { ...str, maxLength: 4000 },
    }),
    (id, b) => manager.review(id, b),
  );
  post<{
    expectedHash: string;
    path: string;
    oldValue: string;
    newValue: string;
    featurePath: string;
  }>(
    '/api/maintenance/diagnoses/:id/repair',
    obj({ expectedHash: digest, path: str, oldValue: str, newValue: str, featurePath: str }),
    (id, b) => manager.propose(id, b),
  );
  for (const action of ['prepare', 'apply', 'cancel', 'prepareRollback', 'rollback'] as const)
    post<{ expectedHash: string }>(
      `/api/maintenance/repairs/:id/${action}`,
      obj({ expectedHash: digest }),
      (id, b) => manager[action](id, b.expectedHash),
    );
  post<{ expectedHash: string; fingerprint: string; trustExecution: boolean; baseUrl: string }>(
    '/api/maintenance/repairs/:id/validate',
    obj({
      expectedHash: digest,
      fingerprint: digest,
      trustExecution: { type: 'boolean' },
      baseUrl: { ...str, maxLength: 2048 },
    }),
    (id, b) => manager.validate(id, b),
  );
  post<{ kind: 'source' | 'target'; id: string }>(
    '/api/intelligence/relationships',
    obj({ kind: { enum: ['source', 'target'] }, id: str }),
    (_, b) => relationships(manager.index, b),
  );
}
