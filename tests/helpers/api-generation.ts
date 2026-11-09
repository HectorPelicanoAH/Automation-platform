import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AgentProvider } from '../../packages/generation/provider.ts';
import { generationFixture, fixtureProvider, finished, featurePath } from './generation.ts';
export const specText = readFileSync(resolve('apps/demo/openapi.json'), 'utf8');
export const apiText = readFileSync(
  resolve('templates/automation/api/src/test/resources/features/promotions.feature'),
  'utf8',
)
  .replace(
    '  Background:\n',
    "  Background:\n    * def schema = call read('classpath:helpers/promotion-schema.feature')\n",
  )
  .replace(
    / {4}And match response == .*\n/,
    '$&    And match response == schema.promotionSchema\n',
  );
export function apiFixture(provider?: AgentProvider) {
  const p = generationFixture(
    provider || {
      async run(request) {
        const input = JSON.parse(request.prompt);
        if (!input.endpoint) return fixtureProvider.run(request);
        const target = input.repositories.find((r: { kind: string }) => r.kind === 'target');
        await request.onTool('qa_lookup', { query: 'promotion schema endpoint' });
        await request.onTool('qa_read_file', { ...input.endpoint.ref, path: input.endpoint.path });
        await request.onTool('qa_read_file', {
          ...target,
          path: 'api/src/test/resources/helpers/promotion-schema.feature',
        });
        return {
          output: {
            plan: {
              summary:
                'Fixture-only API generation; reuse response schema and preserve two datasets.',
              reuse: [
                {
                  path: 'api/src/test/resources/helpers/promotion-schema.feature',
                  symbol: 'Reusable promotion response schema',
                },
              ],
              files: [input.apiFeaturePath],
            },
            files: [{ path: input.apiFeaturePath, content: apiText }],
          },
          model: 'fixture-only',
          usage: null,
          threadId: 'fixture-api',
        };
      },
    },
  );
  const root = join(p.root, 'backend');
  mkdirSync(root);
  writeFileSync(join(root, 'openapi.json'), specText);
  writeFileSync(
    join(root, 'server.ts'),
    "import Fastify from 'fastify'; const app=Fastify(); app.get('/api/promotions/free-shipping', async()=>({}));",
  );
  const backend = p.workspace.addSource({
    name: 'Synthetic backend',
    path: root,
    kind: 'backend',
    enabled: true,
    indexEnabled: true,
    preferredRef: '',
    include: [],
    exclude: [],
  });
  return { ...p, backend };
}
export async function reviewed(p: ReturnType<typeof apiFixture>) {
  const task = await finished(
    p,
    (
      await p.generation.analyze({
        targetId: p.target.id,
        recordingId: p.recordingId,
        featurePath,
        sourceIds: [p.source.id, p.backend.id],
      })
    ).id,
  );
  assert.equal(task.status, 'SUCCEEDED', task.error);
  const draft = p.generation.repository.get('contracts', task.contractId!);
  return p.generation.review(draft.id, {
    expectedHash: draft.hash,
    gherkin: draft.gherkin,
    answers: draft.questions.map((q) => ({
      id: q.id,
      text: 'Confirm both synthetic demonstration datasets and independent API field assertions; visible UI is separate.',
    })),
    approve: true,
  });
}
