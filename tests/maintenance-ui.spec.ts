import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { demoApp } from '../apps/demo/app.ts';
import { generationFixture, completeSteps, featurePath } from './helpers/generation.ts';
import { targetRevision } from '../packages/generation/staging.ts';
import type { Run } from '../packages/domain/model.ts';
const exec = promisify(execFile);

test('Maintenance web flow: native locator failure, product negative control, reviewed repair, independent execution and reversal', async ({
  page,
}) => {
  const p = generationFixture();
  const demo = demoApp(),
    broken = demoApp({ wrongAmount: true });
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  const brokenUrl = await broken.listen({ host: '127.0.0.1', port: 0 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  const pagePath = join(p.target.path, 'ui/pages/PromotionsPage.ts');
  const original = readFileSync(pagePath, 'utf8');
  const faulty = original.replaceAll('promotion-amount', 'obsolete-amount');
  const outcomes: { label: string; run: Run }[] = [];
  const waitRun = async (id: string) => {
    await expect
      .poll(() => p.store.get('runs', id)!.status, { timeout: 120000 })
      .not.toMatch(/QUEUED|RUNNING|CANCEL_REQUESTED/);
    return p.store.get('runs', id)!;
  };
  try {
    writeFileSync(join(p.target.path, 'ui/steps/promotions.ts'), completeSteps);
    writeFileSync(pagePath, faulty);
    const pnpm = process.env.QA_PNPM_CLI;
    const args = ['--dir', join(p.target.path, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) args.push('--store-dir', process.env.QA_PNPM_STORE);
    await exec(pnpm ? process.execPath : 'pnpm', pnpm ? [pnpm, ...args] : args, {
      env: { ...process.env, CI: 'true' },
      timeout: 180000,
      maxBuffer: 4000000,
    });
    p.store.put('targets', { ...p.target, trustFingerprint: p.workspace.fingerprint(p.target) });
    const start = (url: string) =>
      p.manager.create({
        targetId: p.target.id,
        framework: 'playwright',
        selection: { kind: 'feature', value: featurePath },
        baseUrl: url,
        idempotencyKey: randomUUID(),
      });
    const failed = await waitRun(start(demoUrl).id);
    expect(failed.status).toBe('FAILED');
    expect(failed.tests).toHaveLength(2);
    expect(failed.tests.every((t) => t.status === 'FAILED')).toBe(true);
    outcomes.push({ label: 'Actual obsolete locator baseline', run: failed });
    const revision = targetRevision(p.target.path);
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Runs', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect ↗', exact: true }).first().click();
    await page.getByRole('button', { name: 'Inspect failed run', exact: true }).click();
    await expect(page.getByLabel('Reviewed classification')).toHaveValue('UNKNOWN');
    await page.getByLabel('Reviewed classification').selectOption('LOCATOR_DEFECT');
    await page
      .getByLabel('Diagnostic rationale')
      .fill(
        'Controlled locator defect: obsolete test identifier; unchanged business expectations.',
      );
    // Independent browser inspection is the explicit QA actor observation, not an automatic grant.
    const observed = await page.context().newPage();
    await observed.goto(demoUrl + '/promotions?countryIso=es&languageIso=es&brand=demo');
    await expect(observed.getByTestId('promotion-amount')).toHaveCount(1);
    await expect(observed.getByTestId('promotion-amount')).toHaveText('50€');
    await expect(observed.getByTestId('obsolete-amount')).toHaveCount(0);
    await observed.close();
    await page
      .getByLabel('Observed evidence and business intent')
      .fill(
        'Independent browser inspection: promotion-amount occurs once and shows 50€ for Spain; obsolete-amount absent. The original contract and expected title/amount/subtitle remain authoritative.',
      );
    await page.getByRole('button', { name: 'Record diagnostic review', exact: true }).click();
    await page.getByLabel('Existing Page or component').selectOption('ui/pages/PromotionsPage.ts');
    await page.getByLabel('Old locator literal').fill('obsolete-amount');
    await page.getByLabel('Observed replacement literal').fill('promotion-amount');
    await page.getByRole('button', { name: 'Propose literal locator repair', exact: true }).click();
    await expect(page.getByLabel('Repair diff')).toContainText('promotion-amount');
    const repair = p.maintenance.list<{ id: string }>('repair')[0];
    const proposal = p.maintenance.repair(repair.id);
    expect(proposal.files).toHaveLength(1);
    expect(proposal.files[0].after.replaceAll('"promotion-amount"', "'promotion-amount'")).toBe(
      original,
    );
    expect(targetRevision(p.target.path)).toBe(revision);
    // Real cancellation never turns a missing validation into success and cannot write the target.
    const prepared = p.maintenance.prepare(repair.id, proposal.hash);
    const cancelling = p.maintenance.validate(repair.id, {
      expectedHash: proposal.hash,
      fingerprint: prepared.fingerprint,
      trustExecution: true,
      baseUrl: demoUrl,
    });
    p.maintenance.cancel(repair.id, proposal.hash);
    const cancelled = await waitRun(cancelling.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(p.maintenance.repair(repair.id).status).toBe('STAGED');
    expect(targetRevision(p.target.path)).toBe(revision);
    outcomes.push({ label: 'Actual cancelled validation; no successful evidence', run: cancelled });
    // Reload remounts the panel from persisted state after the explicit API cancellation actor.
    await page.reload();
    await page.getByRole('button', { name: 'Runs', exact: true }).click();
    // Select the original failed target run, not the staged cancelled run.
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(failed.id.slice(0, 8), { exact: false }) });
    if (await row.count())
      await row.getByRole('button', { name: 'Inspect ↗', exact: true }).click();
    else {
      const rows = page
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Inspect ↗', exact: true }) });
      await rows.last().getByRole('button', { name: 'Inspect ↗', exact: true }).click();
    }
    for (const [url, expected] of [
      [brokenUrl, 'STAGED'],
      [demoUrl, 'VALIDATED'],
    ] as const) {
      await page.getByRole('button', { name: 'Prepare repair validation', exact: true }).click();
      await page.getByLabel('Repair validation URL').fill(url);
      await page
        .getByLabel('I trust this staged repair and selected environment for execution')
        .check();
      await page.getByRole('button', { name: 'Run native repair validation', exact: true }).click();
      await expect
        .poll(() => p.maintenance.repair(repair.id).status, { timeout: 120000 })
        .toBe(expected);
      const current = p.maintenance.repair(repair.id),
        run = p.store.get('runs', current.validationRunId!)!;
      expect(run.tests).toHaveLength(2);
      expect(run.status).toBe(expected === 'VALIDATED' ? 'PASSED' : 'FAILED');
      outcomes.push({
        label:
          expected === 'VALIDATED'
            ? 'Actual corrected locator and correct product'
            : 'Actual wrong product remains failing after locator repair',
        run,
      });
      expect(readFileSync(pagePath, 'utf8')).toBe(faulty);
    }
    await expect(
      page.getByRole('button', { name: 'Apply reviewed repair', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('I approve applying this exact repair diff').check();
    await page.getByRole('button', { name: 'Apply reviewed repair', exact: true }).click();
    await expect.poll(() => p.maintenance.repair(repair.id).status).toBe('APPLIED');
    expect(readFileSync(pagePath, 'utf8')).toBe(proposal.files[0].after);
    p.store.put('targets', { ...p.target, trustFingerprint: p.workspace.fingerprint(p.target) });
    const independent = await waitRun(start(demoUrl).id);
    expect(independent.status).toBe('PASSED');
    expect(independent.tests).toHaveLength(2);
    outcomes.push({ label: 'Independent post-application native execution', run: independent });
    // A real current product failure is diagnosed but cannot enter locator repair after review.
    const product = await waitRun(start(brokenUrl).id);
    expect(product.status).toBe('FAILED');
    const diagnosis = await p.maintenance.diagnose(product.id);
    expect(diagnosis.hypotheses.some((h) => h.classification === 'PRODUCT_REGRESSION')).toBe(true);
    p.maintenance.review(diagnosis.id, {
      expectedHash: diagnosis.evidenceHash,
      classification: 'PRODUCT_REGRESSION',
      rationale: 'Controlled UI amount mutation to 99€; original expected 50€/60€ preserved.',
      observedEvidence: 'Same implementation passes correct demo and fails wrong-amount demo.',
    });
    expect(() =>
      p.maintenance.propose(diagnosis.id, {
        expectedHash: diagnosis.evidenceHash,
        path: 'ui/pages/PromotionsPage.ts',
        oldValue: 'promotion-amount',
        newValue: 'other',
        featurePath,
      }),
    ).toThrow(/reviewed locator defect/);
    outcomes.push({ label: 'Actual product regression; repair refused', run: product });
    const temporary = createServer();
    await new Promise<void>((resolve) => temporary.listen(0, '127.0.0.1', resolve));
    const closedPort = (temporary.address() as import('node:net').AddressInfo).port;
    await new Promise<void>((resolve, reject) =>
      temporary.close((error) => (error ? reject(error) : resolve())),
    );
    const environment = await waitRun(start(`http://127.0.0.1:${closedPort}`).id);
    expect(environment.status).toBe('FAILED');
    const envDiagnosis = await p.maintenance.diagnose(environment.id);
    outcomes.push({ label: 'Actual unavailable environment', run: environment });
    expect(envDiagnosis.hypotheses.some((h) => h.classification === 'ENVIRONMENT')).toBe(true);
    await page.getByRole('button', { name: 'Inspect reversal diff', exact: true }).click();
    await expect(page.getByLabel('Reversal diff')).toContainText('obsolete-amount');
    const changed = readFileSync(pagePath, 'utf8') + '\n// concurrent edit\n';
    writeFileSync(pagePath, changed);
    expect(() =>
      p.maintenance.rollback(repair.id, p.maintenance.repair(repair.id).rollback!.hash),
    ).toThrow(/changed/);
    expect(readFileSync(pagePath, 'utf8')).toBe(changed);
    writeFileSync(pagePath, proposal.files[0].after);
    await page.getByRole('button', { name: 'Inspect reversal diff', exact: true }).click();
    await page.getByLabel('I approve this exact reversal; the original failure may return').check();
    await page.getByRole('button', { name: 'Apply reviewed reversal', exact: true }).click();
    await expect.poll(() => p.maintenance.repair(repair.id).rollback?.status).toBe('APPLIED');
    expect(readFileSync(pagePath, 'utf8')).toBe(faulty);
    await page.screenshot({ path: 'test-results/phase5-maintenance.png', fullPage: true });
    // A fresh, unreviewed diagnosis must not inherit an older diagnosis's approved repair.
    const unreviewed = await p.maintenance.diagnose(failed.id);
    expect(unreviewed.conclusion).toBe('UNKNOWN');
    await page.reload();
    await page.getByRole('button', { name: 'Runs', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ has: page.getByText(failed.id.slice(0, 8), { exact: false }) })
      .getByRole('button', { name: 'Inspect ↗', exact: true })
      .click();
    await expect(page.getByLabel('Reviewed classification')).toHaveValue('UNKNOWN');
    await expect(page.getByLabel('Repair diff')).toHaveCount(0);

    writeFileSync(
      'test-results/phase5-native-evidence.json',
      JSON.stringify(
        {
          source:
            'Actual native Playwright runs and synthetic QA reviewer via web/API; no model calls',
          repairId: repair.id,
          diffHash: proposal.hash,
          diagnosisAssociationIsolation: true,
          originalPageHash: proposal.files[0].baseHash,
          outcomes,
          final: p.maintenance.repair(repair.id),
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

test('Maintenance data failure: real Karate setup rejection stays failing and cannot enter locator repair', async () => {
  const p = generationFixture(),
    demo = demoApp();
  const url = await demo.listen({ host: '127.0.0.1', port: 0 });
  try {
    const apiPath = join(p.target.path, 'api/src/test/resources/features/promotions.feature');
    const original = readFileSync(apiPath, 'utf8');
    const faulty = original.replace(
      '* url baseUrl',
      "* url baseUrl\n    * call read('classpath:helpers/missing-context.feature')",
    );
    writeFileSync(apiPath, faulty);
    writeFileSync(
      join(p.target.path, 'api/src/test/resources/helpers/missing-context.feature'),
      "@ignore\nFeature: Synthetic missing setup fixture\nScenario: Load a required existing context\n  Given url baseUrl\n  And path '/api/demo/contexts/missing-fixture'\n  When method get\n  Then status 200\n",
    );
    p.store.put('targets', { ...p.target, trustFingerprint: p.workspace.fingerprint(p.target) });
    const pending = p.manager.create({
      targetId: p.target.id,
      framework: 'karate',
      selection: { kind: 'feature', value: featurePath },
      baseUrl: url,
      idempotencyKey: randomUUID(),
    });
    await expect
      .poll(() => p.store.get('runs', pending.id)!.status, { timeout: 150000 })
      .toBe('FAILED');
    const run = p.store.get('runs', pending.id)!;
    expect(run.tests).toHaveLength(2);
    expect(run.tests.every((t) => t.status === 'FAILED')).toBe(true);
    const d = await p.maintenance.diagnose(run.id);
    expect(d.hypotheses.some((h) => h.classification === 'DATA')).toBe(true);
    p.maintenance.review(d.id, {
      expectedHash: d.evidenceHash,
      classification: 'DATA',
      rationale: 'Controlled absent synthetic precondition; business assertions have not executed.',
      observedEvidence:
        'Native Karate evidence: required context missing-fixture returns 404; fix setup rather than the promotion assertions.',
    });
    expect(() =>
      p.maintenance.propose(d.id, {
        expectedHash: d.evidenceHash,
        path: 'ui/pages/PromotionsPage.ts',
        oldValue: 'promotion-amount',
        newValue: 'other',
        featurePath,
      }),
    ).toThrow(/reviewed locator defect/);
    expect(readFileSync(apiPath, 'utf8')).toBe(faulty);
    writeFileSync(
      'test-results/phase5-data-evidence.json',
      JSON.stringify(
        {
          source: 'Actual native Karate invalid setup control; synthetic fixture, no inference',
          run,
          diagnosis: d,
          businessAssertionsPreserved: original
            .split('\n')
            .filter((line) => /match response|status 200/.test(line))
            .every((line) => faulty.includes(line)),
        },
        null,
        2,
      ),
    );
  } finally {
    await p.app.close();
    await demo.close();
  }
});
