import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { demoApp } from '../apps/demo/app.ts';
import { BrowserCapture } from '../packages/recording/capture.ts';
import { monotonicMs } from '../packages/recording/model.ts';
import { generationFixture } from './helpers/generation.ts';
const exec = promisify(execFile);

test('Generation web flow: real recording, reviewed fixture proposal, native UI validation and exact diff application', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
    console.log('Browser error:', error.message);
  });
  const p = generationFixture();
  const demo = demoApp();
  const broken = demoApp({ wrongAmount: true });
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  const brokenUrl = await broken.listen({ host: '127.0.0.1', port: 0 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  let capture: BrowserCapture | undefined;
  try {
    const record = p.recorder.repository.get(p.recordingId);
    record.name = 'Actual promotion browser evidence';
    record.policy.url = demoUrl;
    record.policy.allowedOrigins = [demoUrl];
    record.status = 'RECORDING';
    p.recorder.repository.put(record);
    const start = monotonicMs();
    capture = new BrowserCapture(record.policy, start, (event) => {
      p.recorder.repository.append(p.recorder.repository.get(record.id), {
        ...event,
        receivedMs: monotonicMs() - start,
      });
    });
    const observed = await capture.start(false);
    await observed.getByRole('region', { name: 'Free shipping promotion' }).click();
    await expect
      .poll(() =>
        p.recorder.repository.events(record.id).some((e) => e.aria?.includes('Envío gratis')),
      )
      .toBe(true);
    await observed.getByRole('link', { name: 'Portugal', exact: true }).click();
    await observed.getByRole('region', { name: 'Free shipping promotion' }).click();
    await expect
      .poll(() =>
        p.recorder.repository.events(record.id).some((e) => e.aria?.includes('Envio grátis')),
      )
      .toBe(true);
    await capture.stop();
    capture = undefined;
    const final = p.recorder.repository.get(record.id);
    final.status = 'COMPLETED';
    final.durationMs = monotonicMs() - start;
    p.recorder.repository.put(final);
    const pnpm = process.env.QA_PNPM_CLI;
    const args = ['--dir', join(p.target.path, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) args.push('--store-dir', process.env.QA_PNPM_STORE);
    await exec(pnpm ? process.execPath : 'pnpm', pnpm ? [pnpm, ...args] : args, {
      env: { ...process.env, CI: 'true' },
      timeout: 180000,
      maxBuffer: 4000000,
    });
    const original = readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8');
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByLabel('Synthetic frontend', { exact: true }).check();
    await page.getByRole('button', { name: 'Index selected repositories', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Source recording', exact: true })
      .selectOption(record.id);
    await page.getByRole('button', { name: 'Analyze recording', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Proposed Gherkin', exact: true })).toHaveValue(
      /Scenario Outline/,
    );
    await expect(
      page.getByRole('button', { name: 'Plan and generate Playwright changes', exact: true }),
    ).toBeDisabled();
    await page.getByText('Claims and recording evidence', { exact: true }).click();
    await page.getByRole('button', { name: 'Inspect narration:0', exact: true }).click();
    await expect(
      page.getByText('Narrated demonstration expectations need review', { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel('Confirm the demonstration datasets and threshold wording.', { exact: true })
      .fill('I confirm both narrated synthetic datasets and the visible UI expectations.');
    await page.getByRole('button', { name: 'Approve this Gherkin revision', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Execution target', exact: true })
      .selectOption('both');
    await expect(
      page.getByRole('button', { name: 'Plan and generate Karate changes', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Plan and generate Playwright changes', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Prepare private validation', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Test save status')).toContainText(
      'target files have not been changed',
    );
    expect(readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8')).toBe(original);
    const proposal = p.generation.repository.list('changes')[0];
    writeFileSync('test-results/generated-fixture-diff.txt', proposal.diff);
    for (const [url, expected] of [
      [brokenUrl, 'STAGED'],
      [demoUrl, 'VALIDATED'],
    ] as const) {
      await page.getByRole('button', { name: 'Prepare private validation', exact: true }).click();
      await page.getByLabel('Validation application URL', { exact: true }).fill(url);
      await page
        .getByLabel('I trust this staged code and dependencies for execution', { exact: true })
        .check();
      await page
        .getByRole('button', { name: 'Run staged Playwright validation', exact: true })
        .click();
      await expect
        .poll(() => p.generation.change(proposal.id).status, { timeout: 90000 })
        .toBe(expected);
      const current = p.generation.change(proposal.id);
      const run = p.store.get('runs', current.validationRunId!)!;
      expect(run.status).toBe(expected === 'VALIDATED' ? 'PASSED' : 'FAILED');
      expect(run.tests).toHaveLength(2);
      expect(readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8')).toBe(original);
      if (expected === 'STAGED')
        await expect(
          page.getByRole('button', { name: 'Prepare private validation', exact: true }),
        ).toBeEnabled();
    }
    await expect(
      page.getByLabel('I approve applying this exact diff to Synthetic generation fixture', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Apply approved diff', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('I approve applying this exact diff to Synthetic generation fixture', {
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Apply approved diff', exact: true }).click();
    await expect.poll(() => p.generation.change(proposal.id).status).toBe('APPLIED');
    expect(readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8')).toContain(
      'promotions.expectPromotion',
    );
    await expect(page.getByLabel('Test save status')).toContainText('Test files saved in');
    await expect(page.getByLabel('Test save status')).toContainText(p.target.path);
    const cliEnv: NodeJS.ProcessEnv = {
      ...process.env,
      QA_BASE_URL: demoUrl,
      QA_REPORT_DIR: join(p.root, 'independent-report'),
      CI: 'true',
    };
    for (const key of Object.keys(cliEnv))
      if (
        key.startsWith('PW_TEST_') ||
        [
          'TEST_WORKER_INDEX',
          'TEST_PARALLEL_INDEX',
          'PLAYWRIGHT_BDD_CONFIGS',
          'PLAYWRIGHT_BDD_GEN',
        ].includes(key)
      )
        delete cliEnv[key];
    for (const cli of ['playwright-bdd/dist/cli/index.js', '@playwright/test/cli.js']) {
      await exec(
        process.execPath,
        [
          join(p.target.path, 'ui/node_modules', cli),
          ...(cli.startsWith('@playwright') ? ['test'] : []),
        ],
        { cwd: join(p.target.path, 'ui'), env: cliEnv, timeout: 90000, maxBuffer: 4000000 },
      );
    }
    const independent = JSON.parse(
      readFileSync(join(p.root, 'independent-report/results.json'), 'utf8'),
    ) as { stats: { expected: number; unexpected: number } };
    expect(independent.stats.expected).toBe(2);
    expect(independent.stats.unexpected).toBe(0);
    expect(browserErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/generation-workbench.png', fullPage: true });
    const change = p.generation.change(proposal.id);
    writeFileSync(
      'test-results/phase3-fixture-evidence.json',
      JSON.stringify(
        {
          source:
            'Deterministic provider fixture; actual browser recording, web review actor and native Playwright execution',
          recordingEvents: final.events,
          proposalId: change.id,
          diffHash: change.hash,
          reuse: change.plan.reuse,
          status: change.status,
          independentNativeTests: independent.stats,
          validationRun: p.store.get('runs', change.validationRunId!),
        },
        null,
        2,
      ),
    );
  } finally {
    await capture?.stop();
    await p.app.close();
    await demo.close();
    await broken.close();
  }
});
