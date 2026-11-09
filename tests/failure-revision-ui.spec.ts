import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import Fastify from 'fastify';
import { demoApp } from '../apps/demo/app.ts';
import { BrowserCapture } from '../packages/recording/capture.ts';
import { monotonicMs, type EvidenceEvent } from '../packages/recording/model.ts';
import {
  generationFixture,
  fixtureProvider,
  finished,
  completeSteps,
} from './helpers/generation.ts';
import { adviceReply } from './helpers/failure-advice.ts';

const pagePath = 'ui/pages/PromotionAction.ts';
const actionSource = `import { expect, type Page, type Locator } from '@playwright/test';
export class PromotionAction {
 readonly promotion: Locator;
 constructor(page: Page) { this.promotion = page.getByRole('button', { name: 'Free shipping promotion', exact: true }); }
 async open() { await expect(this.promotion).toHaveCount(1); await this.promotion.click(); }
}`;

test('Native failed proposal → trace-aware conversation → reviewed locator diff → real passing validation', async ({
  page,
}) => {
  let traceRead = false;
  const p = generationFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      if (input.task.startsWith('Discuss')) {
        const trace = input.evidence.traces.find(
          (t: { status: string }) => t.status === 'AVAILABLE',
        );
        expect(trace).toBeTruthy();
        expect(JSON.stringify(trace.events)).toContain('to.have.count');
        expect(JSON.stringify(trace.events)).toContain('Free shipping promotion');
        traceRead = true;
        return { output: adviceReply, model: 'fixture', usage: null, threadId: 'synthetic-advice' };
      }
      if (input.task.startsWith('Propose a minimal locator-only'))
        return {
          output: {
            summary:
              'Fixture: recorded promotion region replaces incorrect button role; preserve all assertions.',
            replacements: [
              { path: pagePath, oldValue: 'button', newValue: 'region', argument: 'role' },
            ],
          },
          model: 'fixture',
          usage: null,
          threadId: 'synthetic-revision',
        };
      const result = await fixtureProvider.run(request);
      if (input.task.startsWith('Plan')) {
        const output = result.output as {
          files: { path: string; content: string }[];
          plan: { files: string[]; reuse: { path: string; symbol: string }[] };
        };
        output.plan.reuse = output.plan.reuse.filter((r) => r.path !== 'ui/steps/promotions.ts');
        output.files[0].content =
          "import { PromotionAction } from '../pages/PromotionAction';\n" +
          completeSteps
            .replace('async ({ promotions, customer })', 'async ({ promotions, customer, page })')
            .replace(
              'await promotions.visit(customer);',
              'await promotions.visit(customer);\n  await new PromotionAction(page).open();',
            );
        output.files.push({ path: pagePath, content: actionSource });
        output.plan.files.push(pagePath);
      }
      return result;
    },
  });
  const demo = demoApp();
  const url = await demo.listen({ host: '127.0.0.1', port: 0 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const args = ['--dir', join(p.target.path, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) args.push('--store-dir', process.env.QA_PNPM_STORE);
    await promisify(execFile)(process.execPath, [process.env.QA_PNPM_CLI!, ...args], {
      env: { ...process.env, CI: 'true' },
      timeout: 180000,
    });
    const stepsPath = join(p.target.path, 'ui/steps/promotions.ts');
    writeFileSync(stepsPath, readFileSync(stepsPath, 'utf8').split('\nWhen(')[0] + '\n');
    const analyzed = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: p.recordingId,
          featurePath: 'contracts/features/promotions.feature',
          sourceIds: [],
        })
      ).id,
    );
    expect(analyzed.status, analyzed.error).toBe('SUCCEEDED');
    const contract = p.generation.repository.list('contracts')[0];
    p.generation.review(contract.id, {
      expectedHash: contract.hash,
      gherkin: contract.gherkin,
      answers: contract.questions.map((q) => ({
        id: q.id,
        text: 'Synthetic demonstration confirmed',
      })),
      approve: true,
    });
    const approved = p.generation.repository.get('contracts', contract.id);
    const task = await finished(p, (await p.generation.implement(contract.id, approved.hash)).id);
    expect(task.status, task.error).toBe('SUCCEEDED');
    const parent = p.generation.change(task.changeId!);
    const prepared = p.generation.prepareValidation(parent.id, parent.hash);
    const run = p.generation.validate(parent.id, {
      expectedHash: parent.hash,
      fingerprint: prepared.fingerprint,
      trustExecution: true,
      baseUrl: url,
    });
    await expect.poll(() => p.store.get('runs', run.id)!.status, { timeout: 90000 }).toBe('FAILED');
    expect(p.store.get('runs', run.id)!.tests).toHaveLength(2);
    const before = readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8');
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Change proposal', exact: true })
      .selectOption(parent.id);
    const conversation = page.getByRole('region', { name: 'AI failure conversation', exact: true });
    await conversation
      .getByLabel('Question about this failure', { exact: true })
      .fill('The promotion is a region. Use the failure trace to propose a solution.');
    await conversation.getByRole('button', { name: 'Send to AI', exact: true }).click();
    await expect(conversation.getByText(adviceReply.summary, { exact: true })).toBeVisible();
    expect(traceRead).toBe(true);
    await conversation
      .getByRole('button', { name: 'Propose locator correction', exact: true })
      .click();
    await expect(
      conversation.getByRole('region', { name: 'Proposed correction', exact: true }),
    ).toContainText('region');
    expect(readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8')).toBe(before);
    await conversation
      .getByRole('button', { name: 'Review and validate correction', exact: true })
      .click();
    const revised = p.generation.repository
      .list('changes')
      .find((c) => c.revisionOf?.changeId === parent.id)!;
    await expect(page.getByRole('combobox', { name: 'Change proposal', exact: true })).toHaveValue(
      revised.id,
    );
    await page.getByRole('button', { name: 'Prepare private validation', exact: true }).click();
    await page.getByLabel('Validation application URL', { exact: true }).fill(url);
    await page
      .getByLabel('I trust this staged code and dependencies for execution', { exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Run staged Playwright validation', exact: true })
      .click();
    await expect
      .poll(() => p.generation.change(revised.id).status, { timeout: 90000 })
      .toBe('VALIDATED');
    const corrected = p.generation.change(revised.id);
    expect(p.store.get('runs', corrected.validationRunId!)!.tests).toHaveLength(2);
    expect(corrected.files.find((f) => f.path === pagePath)!.after).toBe(
      actionSource.replace("'button'", '"region"'),
    );
    expect(readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8')).toBe(before);
    expect(p.store.get('runs', run.id)!.status).toBe('FAILED');
    await expect(
      page.getByRole('button', { name: 'Apply approved diff', exact: true }),
    ).toBeDisabled();
  } finally {
    await p.app.close();
    await demo.close();
  }
});

test('Recorder saves per-page/frame sanitized DOM and reconstructed accessibility, available to AI only by scoped retrieval', async () => {
  const site = Fastify();
  site.get('/', async (_, reply) =>
    reply
      .type('text/html')
      .send(
        '<html lang="es"><head><meta charset="utf-8"></head><body><h1>Catálogo</h1><input value="form-private-123"><div data-private>private-region-456</div><div class="masked">custom-private-789</div><div style="display:none">hidden-private</div><a href="/next?token=url-private-001">Continuar</a><iframe src="/frame"></iframe></body></html>',
      ),
  );
  site.get('/next', async (_, reply) =>
    reply
      .type('text/html')
      .send(
        '<html lang="pt"><body><h1>Pagamento</h1><button onclick="document.querySelector(\'h1\').textContent=\'Confirmado\'">Confirmar</button></body></html>',
      ),
  );
  site.get('/frame', async (_, reply) => reply.type('text/html').send('<button>Ayuda</button>'));
  const url = await site.listen({ host: '127.0.0.1', port: 0 });
  const p = generationFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      expect(input.evidence.snapshots.length).toBeGreaterThanOrEqual(3);
      const snapshot = (await request.onTool('qa_recording_snapshot', {
        sequence: input.evidence.snapshots[0].sequence,
      })) as { hash: string; event: EvidenceEvent };
      expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.event.dom).toBeTruthy();
      expect(snapshot.event.aria).toBeTruthy();
      await expect(request.onTool('qa_recording_snapshot', { sequence: 999999 })).rejects.toThrow(
        'unavailable',
      );
      return fixtureProvider.run(request);
    },
  });
  const events: EvidenceEvent[] = [];
  const record = p.recorder.repository.get(p.recordingId);
  record.status = 'RECORDING';
  record.policy.url = url;
  record.policy.allowedOrigins = [url];
  record.policy.maskSelectors = ['.masked'];
  p.recorder.repository.put(record);
  const start = monotonicMs();
  const capture = new BrowserCapture(record.policy, start, (event) =>
    events.push(
      p.recorder.repository.append(p.recorder.repository.get(record.id), {
        ...event,
        receivedMs: monotonicMs() - start,
      }),
    ),
  );
  try {
    const observed = await capture.start(true);
    await expect
      .poll(() => events.filter((e) => e.snapshotVersion).length)
      .toBeGreaterThanOrEqual(2);
    await observed.getByRole('link', { name: 'Continuar' }).click();
    await expect
      .poll(() => events.some((e) => e.snapshotVersion && e.documentLanguage === 'pt'))
      .toBe(true);
    await observed.getByRole('button', { name: 'Confirmar' }).click();
    await expect
      .poll(() => events.some((e) => e.snapshotVersion && e.dom?.includes('Confirmado')))
      .toBe(true);
    await capture.stop();
    const snapshots = events.filter((e) => e.snapshotVersion);
    expect(snapshots.some((e) => e.aria?.includes('Ayuda'))).toBe(true);
    expect(
      snapshots.some((e) => e.aria?.includes('Catálogo')),
      JSON.stringify(snapshots),
    ).toBe(true);
    for (const secret of [
      'form-private-123',
      'private-region-456',
      'custom-private-789',
      'hidden-private',
      'url-private-001',
    ])
      expect(JSON.stringify(snapshots)).not.toContain(secret);
    const final = p.recorder.repository.get(record.id);
    final.status = 'COMPLETED';
    p.recorder.repository.put(final);
    const task = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: record.id,
          featurePath: 'contracts/features/promotions.feature',
          sourceIds: [],
        })
      ).id,
    );
    expect(task.status, task.error).toBe('SUCCEEDED');
    expect(task.evidenceReads).toHaveLength(1);
    expect(task.retrievalBytes).toBeGreaterThan(0);
  } finally {
    await capture.stop();
    await p.app.close();
    await site.close();
  }
});
