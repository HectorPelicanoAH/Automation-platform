import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { demoApp } from '../apps/demo/app.ts';
import { apiFixture } from './helpers/api-generation.ts';
import { completeSteps, featurePath } from './helpers/generation.ts';
import { GuestSetupPage } from '../templates/automation/ui/pages/GuestSetupPage.ts';
import { prepareGuestContext } from '../templates/automation/ui/builders/preconditions.ts';
import { PromotionsPage } from '../templates/automation/ui/pages/PromotionsPage.ts';
const exec = promisify(execFile);

test('API generation web flow uses reviewed fixture proposals, real Karate and independent UI/API evidence', async ({
  page,
  request,
}) => {
  const p = apiFixture();
  // Restore existing UI bindings before capturing the contract base. No generated UI assertions are changed.
  writeFileSync(join(p.target.path, 'ui/steps/promotions.ts'), completeSteps);
  const preparedContexts: { id: string; countryIso: string; languageIso: string; brand: string }[] =
    [];
  const demo = demoApp({ onContextCreated: (c) => preparedContexts.push(c) }),
    broken = demoApp({ wrongAmount: true });
  const baseUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  const brokenUrl = await broken.listen({ host: '127.0.0.1', port: 0 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  const env = { ...process.env, QA_BASE_URL: baseUrl, CI: 'true' };
  const native = async (feature: string, report: string) =>
    exec(
      join(p.target.path, 'api/gradlew'),
      ['test', '--no-daemon', '--offline', '--rerun-tasks', '--console=plain'],
      {
        cwd: join(p.target.path, 'api'),
        env: { ...env, QA_FEATURE: feature, QA_REPORT_DIR: report },
        timeout: 180000,
        maxBuffer: 4000000,
      },
    );
  try {
    const pnpm = process.env.QA_PNPM_CLI;
    const args = ['--dir', join(p.target.path, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) args.push('--store-dir', process.env.QA_PNPM_STORE);
    await exec(pnpm ? process.execPath : 'pnpm', pnpm ? [pnpm, ...args] : args, {
      env: { ...process.env, CI: 'true' },
      timeout: 180000,
      maxBuffer: 4000000,
    });
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByLabel('Synthetic frontend', { exact: true }).check();
    await page.getByLabel('Synthetic backend', { exact: true }).check();
    await page
      .getByRole('combobox', { name: 'Source recording', exact: true })
      .selectOption(p.recordingId);
    await page.getByRole('button', { name: 'Analyze recording', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Proposed Gherkin', exact: true })).toHaveValue(
      /Scenario Outline/,
    );
    await page
      .getByLabel('Confirm the demonstration datasets and threshold wording.', { exact: true })
      .fill(
        'Both synthetic datasets confirmed. API fields are independent of visible UI rendering.',
      );
    await page.getByRole('button', { name: 'Approve this Gherkin revision', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Execution target', exact: true })
      .selectOption('both');
    await expect(
      page.getByRole('button', { name: 'Plan and generate Karate changes', exact: true }),
    ).toBeDisabled();
    const choices = await page
      .getByRole('combobox', { name: 'Discovered API endpoint', exact: true })
      .locator('option')
      .allTextContents();
    const choice = choices.findIndex((c) => c.includes('openapi.json')) - 1;
    expect(choice).toBeGreaterThanOrEqual(0);
    await page
      .getByRole('combobox', { name: 'Discovered API endpoint', exact: true })
      .selectOption(String(choice));
    await page
      .getByRole('button', { name: 'Plan and generate Karate changes', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Prepare private validation', exact: true }),
    ).toBeVisible();
    const change = p.generation.repository.list('changes')[0];
    const beforeManifest = readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8');
    expect(change.framework).toBe('karate');
    await page.getByRole('button', { name: 'Prepare private validation', exact: true }).click();
    await page.getByLabel('Validation application URL', { exact: true }).fill(baseUrl);
    await page
      .getByLabel('I trust this staged code and dependencies for execution', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Run staged Karate validation', exact: true }).click();
    await expect
      .poll(() => p.generation.change(change.id).status, { timeout: 180000 })
      .toBe('VALIDATED');
    expect(readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8')).toBe(
      beforeManifest,
    );
    await page
      .getByLabel('I approve applying this exact diff to Synthetic generation fixture', {
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Apply approved diff', exact: true }).click();
    await expect.poll(() => p.generation.change(change.id).status).toBe('APPLIED');
    const apiPath = JSON.parse(readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8'))
      .features[0].scenarios[0].bindings.karate.path;
    const independent = join(p.root, 'independent-api');
    await native('classpath:' + apiPath.slice('api/src/test/resources/'.length), independent);
    const suiteReport = join(p.root, 'independent-suite');
    await native('classpath:features', suiteReport);
    const suiteJson = JSON.parse(
      readFileSync(join(suiteReport, 'cucumber-json/features.promotions.json'), 'utf8'),
    );
    expect(suiteJson.flatMap((f: { elements: unknown[] }) => f.elements)).toHaveLength(2);
    const target = p.workspace.target(p.target.id);
    target.trustFingerprint = p.workspace.fingerprint(target);
    p.store.put('targets', target);
    const run = async (framework: 'playwright' | 'karate', url: string) => {
      const created = p.manager.create({
        targetId: target.id,
        framework,
        selection: { kind: 'feature', value: featurePath },
        baseUrl: url,
        idempotencyKey: crypto.randomUUID(),
      });
      await expect
        .poll(() => p.store.get('runs', created.id)?.status, { timeout: 180000 })
        .toMatch(/^(PASSED|FAILED)$/);
      return p.store.get('runs', created.id)!;
    };
    const api = await run('karate', brokenUrl),
      ui = await run('playwright', brokenUrl);
    expect(api.status).toBe('PASSED');
    expect(api.tests).toHaveLength(2);
    expect(ui.status).toBe('FAILED');
    expect(ui.tests).toHaveLength(2);
    expect(ui.tests.every((t) => t.status === 'FAILED')).toBe(true);
    await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'UI / API coverage', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('API state coverage. This result does not establish correct visible UI.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'playwright' })).toContainText('FAILED');
    await expect(page.getByRole('row').filter({ hasText: 'karate' })).toContainText('PASSED');
    await expect(page.getByText(ui.id, { exact: true })).toBeVisible();
    await expect(page.getByText(api.id, { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/phase4-coverage.png', fullPage: true });
    // Existing native helper creates a fresh server-issued UUID per scenario, not cached auth/shared mutable state.
    const parallelFeature = join(
      p.target.path,
      'api/src/test/resources/features/setup-parallel.feature',
    );
    writeFileSync(
      parallelFeature,
      `Feature: Independent API context preparation\n  Scenario Outline: Read back each prepared context\n    * def prepared = call read('classpath:helpers/prepare-context.feature') { countryIso: '<countryIso>', languageIso: '<languageIso>' }\n    Given url baseUrl\n    And path '/api/demo/contexts', prepared.contextId\n    When method get\n    Then status 200\n    And match response == { id: '#(prepared.contextId)', countryIso: '<countryIso>', languageIso: '<languageIso>', brand: 'demo' }\n    Examples:\n      | countryIso | languageIso |\n      | es | es |\n      | pt | pt |\n`,
    );
    const parallelReport = join(p.root, 'parallel-api');
    const priorContexts = preparedContexts.length;
    await native('classpath:features/setup-parallel.feature', parallelReport);
    const concurrent = preparedContexts.slice(priorContexts);
    expect(concurrent).toHaveLength(2);
    expect(new Set(concurrent.map((c) => c.id)).size).toBe(2);
    expect(concurrent.map((c) => c.countryIso).sort()).toEqual(['es', 'pt']);
    const nativeParallel = JSON.parse(
      readFileSync(join(parallelReport, 'cucumber-json/features.setup-parallel.json'), 'utf8'),
    )[0].elements;
    expect(nativeParallel).toHaveLength(2);
    const intervals = nativeParallel.map(
      (s: { start_timestamp: string; steps: { result: { duration: number } }[] }) => ({
        startMs: Date.parse(s.start_timestamp),
        minimumDurationMs: s.steps[0].result.duration / 1_000_000,
      }),
    );
    expect(intervals[1].startMs).toBeLessThan(
      intervals[0].startMs + intervals[0].minimumDurationMs,
    );
    expect(intervals[0].startMs).toBeLessThan(
      intervals[1].startMs + intervals[1].minimumDurationMs,
    );
    const samples: { kind: string; iteration: number; durationMs: number; contextId: string }[] =
      [];
    const createdIds = new Set<string>();
    // Both paths create the same isolated state and open the same promotion UI. Browser is already running.
    for (let i = 0; i < 3; i++)
      for (const kind of i % 2 ? ['api', 'ui'] : ['ui', 'api']) {
        const start = performance.now();
        let contextId: string;
        const customer = { countryIso: 'es', languageIso: 'es', brand: 'demo' };
        if (kind === 'ui') {
          contextId = (await new GuestSetupPage(page).prepare(baseUrl, customer)).contextId;
        } else {
          contextId = (await prepareGuestContext(request, baseUrl, customer)).contextId;
          await page.goto(baseUrl + '/promotions?contextId=' + contextId);
        }
        expect(createdIds.has(contextId)).toBe(false);
        createdIds.add(contextId);
        await new PromotionsPage(page).expectPromotion(
          'Envío gratis',
          '50€',
          'En pedidos superiores a 50€',
        );
        samples.push({ kind, iteration: i, durationMs: performance.now() - start, contextId });
      }
    expect(browserErrors).toEqual([]);
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/phase4-native-evidence.json',
      JSON.stringify(
        {
          source:
            'Deterministic provider fixture; real browser, Karate, target application and native Playwright',
          root: p.root,
          proposalId: change.id,
          diffHash: change.hash,
          validation: p.store.get('runs', p.generation.change(change.id).validationRunId!),
          api,
          ui,
          independentReport: independent,
          independentSuite: { report: suiteReport, scenarios: 2 },
          parallelReport,
          parallelEvidence: { contexts: concurrent, intervals, overlapping: true },
          setupComparison: {
            sampleCountPerArm: 3,
            order: 'alternating',
            includesFinalUiAssertions: true,
            samples,
          },
          browserErrors,
        },
        null,
        2,
      ),
    );
  } finally {
    await p.app.close();
    await demo.close();
    await broken.close();
  }
});
