import type { FastifyInstance } from 'fastify';
import type { GenerationManager } from './manager.ts';
import type { AiSettings } from './model.ts';
import { indexSummary, type RootRef } from '../intelligence/index.ts';
const str = { type: 'string', minLength: 1, maxLength: 200 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export function generationRoutes(app: FastifyInstance, manager: GenerationManager) {
  function post<T>(path: string, body: unknown, handler: (id: string, input: T) => unknown) {
    app.post<{ Params: { id: string }; Body: T }>(
      path,
      { schema: { body: body as Record<string, unknown> } },
      async (request) => handler(request.params.id, request.body as T),
    );
  }
  app.get('/api/generation/state', async () => ({
    settings: manager.repository.settings(),
    codexHome: manager.home,
    tasks: manager.repository
      .list('tasks')
      .map(
        ({ id, kind, status, createdAt, finishedAt, targetId, contractId, changeId, error }) => ({
          id,
          kind,
          status,
          createdAt,
          finishedAt,
          targetId,
          contractId,
          changeId,
          error,
        }),
      ),
    contracts: manager.repository
      .list('contracts')
      .map(({ id, status, featurePath, targetId, recordingId, createdAt }) => ({
        id,
        status,
        featurePath,
        targetId,
        recordingId,
        createdAt,
      })),
    changes: manager.repository.list('changes').map((c) => {
      const { id, status, contractId, targetId, createdAt, validationRunId, error } =
        manager.change(c.id);
      return { id, status, contractId, targetId, createdAt, validationRunId, error };
    }),
  }));
  app.get<{ Params: { id: string } }>('/api/generation/tasks/:id', async (r) =>
    manager.repository.get('tasks', r.params.id),
  );
  app.get<{ Params: { id: string } }>('/api/generation/contracts/:id', async (r) =>
    manager.repository.get('contracts', r.params.id),
  );
  app.get<{ Params: { id: string } }>('/api/generation/changes/:id', async (r) =>
    manager.change(r.params.id),
  );
  post<{ binary: string; trustExecution: boolean }>(
    '/api/generation/cli',
    obj({ binary: { ...str, maxLength: 4096 }, trustExecution: { type: 'boolean' } }),
    (_, b) => manager.trustCli(b.binary, b.trustExecution),
  );
  post<Omit<AiSettings, 'binaryHash'> & { trustExecution: boolean }>(
    '/api/generation/settings',
    obj({
      enabled: { type: 'boolean' },
      binary: { type: 'string', maxLength: 4096 },
      analysisModel: { type: 'string', maxLength: 100 },
      implementationModel: { type: 'string', maxLength: 100 },
      analysisEffort: str,
      implementationEffort: str,
      trustExecution: { type: 'boolean' },
    }),
    (_, b) => {
      const { trustExecution, ...settings } = b;
      return manager.configure(settings, trustExecution);
    },
  );
  post('/api/generation/connection', obj({}), () => manager.connectionInfo());
  post<RootRef>(
    '/api/intelligence/scan',
    obj({ kind: { enum: ['source', 'target'] }, id: str }),
    async (_, b) => indexSummary(await manager.index.scan(b)),
  );
  post<RootRef & { query: string }>(
    '/api/intelligence/lookup',
    obj({
      kind: { enum: ['source', 'target'] },
      id: str,
      query: { type: 'string', maxLength: 200 },
    }),
    (_, b) => ({
      index: manager.index.get(b) ? indexSummary(manager.index.get(b)!) : undefined,
      matches: manager.index.lookup(b, b.query),
    }),
  );
  post<{ targetId: string; recordingId: string; featurePath: string; sourceIds: string[] }>(
    '/api/generation/analyze',
    obj({
      targetId: str,
      recordingId: str,
      featurePath: str,
      sourceIds: { type: 'array', maxItems: 8, uniqueItems: true, items: str },
    }),
    (_, b) => manager.analyze(b),
  );
  post<{
    expectedHash: string;
    gherkin: string;
    answers: { id: string; text: string }[];
    approve: boolean;
  }>(
    '/api/generation/contracts/:id/review',
    obj({
      expectedHash: digest,
      gherkin: { type: 'string', maxLength: 32000 },
      answers: {
        type: 'array',
        maxItems: 50,
        items: obj({ id: str, text: { type: 'string', maxLength: 4000 } }),
      },
      approve: { type: 'boolean' },
    }),
    (id, b) => manager.review(id, b),
  );
  post('/api/generation/contracts/:id/reject', obj({}), (id) => manager.rejectContract(id));
  post<{ expectedHash: string }>(
    '/api/generation/contracts/:id/implement',
    obj({ expectedHash: digest }),
    (id, b) => manager.implement(id, b.expectedHash),
  );
  post('/api/generation/tasks/:id/cancel', obj({}), (id) => manager.cancel(id));
  post<{ expectedHash: string }>(
    '/api/generation/changes/:id/prepare',
    obj({ expectedHash: digest }),
    (id, b) => manager.prepareValidation(id, b.expectedHash),
  );
  post<{ expectedHash: string; fingerprint: string; trustExecution: boolean; baseUrl: string }>(
    '/api/generation/changes/:id/validate',
    obj({
      expectedHash: digest,
      fingerprint: digest,
      trustExecution: { type: 'boolean' },
      baseUrl: { ...str, maxLength: 2048 },
    }),
    (id, b) => manager.validate(id, b),
  );
  post<{ expectedHash: string }>(
    '/api/generation/changes/:id/apply',
    obj({ expectedHash: digest }),
    (id, b) => manager.apply(id, b.expectedHash),
  );
  post<{ expectedHash: string }>(
    '/api/generation/changes/:id/reject',
    obj({ expectedHash: digest }),
    (id, b) => manager.rejectChange(id, b.expectedHash),
  );
}
