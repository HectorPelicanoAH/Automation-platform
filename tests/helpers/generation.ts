import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPlatform } from '../../apps/server/app.ts';
import { hash } from '../../packages/domain/gherkin.ts';
import type { AgentProvider, AgentRequest } from '../../packages/generation/provider.ts';
import type { GenerationTask } from '../../packages/generation/model.ts';
export const featurePath = 'contracts/features/promotions.feature';
export const featureText = readFileSync(resolve('templates/automation/' + featurePath), 'utf8');
export const completeSteps = readFileSync(
  resolve('templates/automation/ui/steps/promotions.ts'),
  'utf8',
);
export const fixtureProvider: AgentProvider = {
  async run(request: AgentRequest) {
    const input = JSON.parse(request.prompt) as {
      repositories: { kind: string; id: string }[];
      task: string;
    };
    const target = input.repositories.find((r) => r.kind === 'target')!;
    await request.onTool('qa_lookup', { query: 'promotions guest customer' });
    for (const path of ['ui/pages/PromotionsPage.ts', 'ui/steps/promotions.ts', 'ui/fixtures.ts'])
      await request.onTool('qa_read_file', { ...target, path });
    request.onEvent({
      kind: 'message',
      text: 'Deterministic provider fixture: existing Page and steps discovered.',
    });
    const output = input.task.startsWith('Discover')
      ? {
          gherkin: featureText,
          claims: [
            {
              text: 'Narrated demonstration expectations need review',
              provenance: 'NARRATED',
              evidenceIds: ['narration:0'],
            },
          ],
          questions: ['Confirm the demonstration datasets and threshold wording.'],
          approved: true,
        }
      : {
          plan: {
            summary: 'Restore the missing thin Then step; reuse existing Page assertions.',
            reuse: [
              { path: 'ui/pages/PromotionsPage.ts', symbol: 'PromotionsPage.expectPromotion' },
              { path: 'ui/steps/promotions.ts', symbol: 'the customer visits the promotions page' },
            ],
            files: ['ui/steps/promotions.ts'],
          },
          files: [{ path: 'ui/steps/promotions.ts', content: completeSteps }],
        };
    return { output, model: 'fixture-only', usage: null, threadId: 'fixture-thread' };
  },
};
export function generationFixture(provider: AgentProvider = fixtureProvider) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-generation-')));
  const platform = createPlatform({
    dataDir: join(root, 'private'),
    generationProviderFactory: () => provider,
  });
  const target = platform.workspace.initialize(
    join(root, 'automation'),
    'Synthetic generation fixture',
  );
  const steps = join(target.path, 'ui/steps/promotions.ts');
  writeFileSync(steps, completeSteps.slice(0, completeSteps.indexOf('\nThen(')) + '\n');
  const sourcePath = join(root, 'frontend');
  mkdirSync(sourcePath);
  writeFileSync(
    join(sourcePath, 'Promotions.tsx'),
    'export function Promotions() { return <section aria-label="Free shipping promotion"><h2>Envío gratis</h2></section>; }',
  );
  const source = platform.workspace.addSource({
    name: 'Synthetic frontend',
    path: sourcePath,
    kind: 'frontend',
    enabled: true,
    indexEnabled: true,
    preferredRef: '',
    include: [],
    exclude: [],
  });
  const id = randomUUID();
  platform.recorder.repository.put({
    id,
    name: 'Synthetic unit evidence; not a real browser recording',
    status: 'COMPLETED',
    createdAt: new Date().toISOString(),
    durationMs: 1000,
    policy: {
      url: 'http://127.0.0.1:4311',
      allowedOrigins: ['http://127.0.0.1:4311'],
      screenshots: false,
      maskSelectors: [],
      sensitiveQueryKeys: [],
      retentionDays: 14,
      audioRetentionDays: 7,
      audioConsent: false,
    },
    events: 0,
    gaps: 0,
    bytes: 0,
    artifacts: [],
    audio: [],
    microphone: 'OFF',
    incomplete: false,
    transcript: [
      {
        revision: 1,
        createdAt: new Date().toISOString(),
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            source: 'manual',
            provenance: 'NARRATED',
            text: 'Demonstration datasets: es/es/demo: Envío gratis, 50€, En pedidos superiores a 50€; pt/pt/demo: Envio grátis, 60€, Em compras superiores a 60€. These are threshold amounts, not reductions.',
          },
        ],
      },
    ],
  });
  platform.generation.repository.settings({
    enabled: true,
    binary: process.execPath,
    binaryHash: hash(readFileSync(process.execPath)),
    analysisModel: 'fixture-model',
    implementationModel: 'fixture-model',
    analysisEffort: 'low',
    implementationEffort: 'low',
  });
  return { ...platform, root, target, source, recordingId: id };
}
export async function finished(
  platform: ReturnType<typeof generationFixture>,
  id: string,
): Promise<GenerationTask> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const task = platform.generation.repository.get('tasks', id);
    if (!['RUNNING', 'CANCEL_REQUESTED'].includes(task.status)) return task;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Fixture task did not finish');
}
