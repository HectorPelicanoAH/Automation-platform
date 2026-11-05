import { test, expect } from '@playwright/test';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createPlatform } from '../apps/server/app.ts';
import { demoApp } from '../apps/demo/app.ts';
import type { Run, Framework, Selection, Source } from '../packages/domain/model.ts';

const exec = promisify(execFile);

test('Real workstation journey: sources, contracts, both runners, failures, cancellation and restart', async ({
  page,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'qa-acceptance-'));
  const dataDir = join(root, 'private');
  const platform = createPlatform({ dataDir });
  const demo = demoApp();
  const broken = demoApp({ wrongAmount: true });
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  const brokenUrl = await broken.listen({ host: '127.0.0.1', port: 0 });
  const base = await platform.app.listen({ host: '127.0.0.1', port: 0 });
  const evidence: {
    framework: string;
    selection: string;
    status: string;
    tests: number;
    durationMs: number;
    idsMapped: number;
  }[] = [];
  const samples: number[] = [];
  let slowRequests = 0;
  const sockets = new Set<import('node:net').Socket>();
  const slow = createServer((_request, _response) => {
    slowRequests++;
  });
  slow.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve));
  const slowUrl = `http://127.0.0.1:${(slow.address() as import('node:net').AddressInfo).port}`;
  try {
    await page.goto(base + '/#launch=' + platform.launchToken);
    await expect(
      page.getByRole('heading', { name: 'Good tests start with clarity.' }),
    ).toBeVisible();
    await expect(
      page.getByText('A private local session is required', { exact: true }),
    ).toHaveCount(0);
    const proof = await page.evaluate(() => sessionStorage.getItem('qa-session-proof')!);
    const state = async () => {
      const start = performance.now();
      const response = await page.request.get(base + '/api/state', {
        headers: { 'X-QA-Session': proof },
      });
      samples.push(performance.now() - start);
      expect(response.ok()).toBeTruthy();
      return response.json() as Promise<{
        runs: Run[];
        targets: { id: string }[];
        csrf: string;
        sources: Source[];
      }>;
    };
    const mutate = async (path: string, body: unknown) => {
      const current = await state();
      return page.request.post(base + '/api' + path, {
        headers: { 'X-QA-Session': proof, 'X-QA-CSRF': current.csrf },
        data: body,
      });
    };
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    for (const [index, kind] of ['frontend', 'backend'].entries()) {
      console.log(`Configure synthetic ${kind} context source`);
      const path = join(root, 'source-' + index);
      mkdirSync(path);
      writeFileSync(
        join(path, 'package.json'),
        JSON.stringify({ dependencies: index ? { fastify: '5' } : { react: '19' } }),
      );
      if (index) {
        await exec('git', ['init', path]);
        await exec('git', [
          '-C',
          path,
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'user.name=QA Fixture',
          '-c',
          'user.email=qa@example.invalid',
          'commit',
          '--allow-empty',
          '-m',
          'Synthetic fixture',
        ]);
      }
      await page.getByLabel('Display name', { exact: true }).fill('Source ' + index);
      await page.getByLabel('Absolute local path', { exact: true }).fill(path);
      await page.getByLabel('Repository type', { exact: true }).selectOption(kind);
      await page.getByRole('button', { name: 'Register read-only source' }).click();
      await expect(
        page.getByRole('heading', { name: 'Source ' + index, exact: true }),
      ).toBeVisible();
      expect(readFileSync(join(path, 'package.json'), 'utf8')).toContain(
        index ? 'fastify' : 'react',
      );
    }
    const targetPath = join(root, 'automation');
    console.log('Initialize external target and install independent runner dependencies');
    await page.getByLabel('Target name').fill('Acceptance automation');
    await page.getByLabel('Absolute target directory').fill(targetPath);
    await page.getByRole('button', { name: 'Connect automation target' }).click();
    await expect(
      page.locator('.target-row').getByText('Acceptance automation', { exact: true }),
    ).toBeVisible();
    const targetId = (await state()).targets[0].id;

    // Explicit fixture setup, not an automatic platform install. Both CLIs are independent.
    const pnpm = process.env.QA_PNPM_CLI;
    const pnpmArgs = ['--dir', join(targetPath, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) pnpmArgs.push('--store-dir', process.env.QA_PNPM_STORE);
    await exec(pnpm ? process.execPath : 'pnpm', pnpm ? [pnpm, ...pnpmArgs] : pnpmArgs, {
      env: { ...process.env, CI: 'true' },
      timeout: 180_000,
      maxBuffer: 4_000_000,
    });
    // The platform smoke itself runs in a Playwright worker; independent CLIs must
    // not inherit that worker's internal configuration/identity variables.
    const cliEnv: NodeJS.ProcessEnv = { ...process.env, QA_BASE_URL: demoUrl, CI: 'true' };
    for (const key of Object.keys(cliEnv))
      if (
        [
          'TEST_WORKER_INDEX',
          'TEST_PARALLEL_INDEX',
          'PLAYWRIGHT_BDD_CONFIGS',
          'PLAYWRIGHT_BDD_GEN',
        ].includes(key) ||
        key.startsWith('PW_TEST_')
      )
        delete cliEnv[key];
    await exec(
      process.execPath,
      [join(targetPath, 'ui/node_modules/typescript/bin/tsc'), '--noEmit'],
      { cwd: join(targetPath, 'ui'), env: cliEnv, timeout: 60_000 },
    );
    await exec(
      process.execPath,
      [join(targetPath, 'ui/node_modules/playwright-bdd/dist/cli/index.js')],
      { cwd: join(targetPath, 'ui'), env: cliEnv, timeout: 60_000 },
    );
    await exec(
      process.execPath,
      [join(targetPath, 'ui/node_modules/@playwright/test/cli.js'), 'test'],
      { cwd: join(targetPath, 'ui'), env: cliEnv, timeout: 90_000, maxBuffer: 4_000_000 },
    );
    await exec(join(targetPath, 'api/gradlew'), ['test', '--no-daemon', '--rerun-tasks'], {
      cwd: join(targetPath, 'api'),
      env: cliEnv,
      timeout: 240_000,
      maxBuffer: 4_000_000,
    });
    const originalFeature = readFileSync(
      join(targetPath, 'contracts/features/promotions.feature'),
      'utf8',
    );
    // The private UI environment controls the selected application under test.
    await page.getByLabel('Application base URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Save environment', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Environment and artifact retention saved.' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
    await page.getByLabel('Feature to edit').selectOption('contracts/features/promotions.feature');
    await expect(page.getByLabel('Gherkin editor')).toHaveValue(originalFeature);
    await page.getByRole('button', { name: 'Validate draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Valid Gherkin.' })).toBeVisible();
    await page.getByRole('button', { name: 'Repository', exact: true }).click();
    await page.getByRole('button', { name: 'ui/pages/PromotionsPage.ts', exact: true }).click();
    await expect(page.locator('.file-preview pre')).toContainText('getByRole');

    async function runViaUI(
      framework: Framework,
      kind: Selection['kind'],
      value: string | undefined,
      expected = 'PASSED',
    ) {
      console.log(`Web execution: ${framework} / ${kind}; expected ${expected}`);
      await page.getByRole('button', { name: 'Runs', exact: true }).click();
      const trustResponse = await page.request.get(`${base}/api/targets/${targetId}/trust`, {
        headers: { 'X-QA-Session': proof },
      });
      if (!((await trustResponse.json()) as { trusted: boolean }).trusted) {
        await page.getByRole('button', { name: 'Trust this project fingerprint' }).click();
      }
      await page.getByLabel('Framework', { exact: true }).selectOption(framework);
      await page.getByLabel('Selection', { exact: true }).selectOption(kind);
      if (value) await page.getByLabel('Selection value').selectOption(value);
      const previous = new Set((await state()).runs.map((r) => r.id));
      await page.getByRole('button', { name: '▷ Start run', exact: true }).click();
      let current: Run | undefined;
      await expect
        .poll(
          async () => {
            current = (await state()).runs.find((r) => !previous.has(r.id));
            return current?.status;
          },
          { timeout: 150_000, intervals: [300, 700, 1000] },
        )
        .toMatch(/PASSED|FAILED|CANCELLED|INTERRUPTED/);
      expect(current!.status, current!.error).toBe(expected);
      expect(current!.tests.length).toBeGreaterThan(0);
      evidence.push({
        framework,
        selection: kind,
        status: current!.status,
        tests: current!.tests.length,
        durationMs: Date.parse(current!.finishedAt!) - Date.parse(current!.startedAt!),
        idsMapped: current!.tests.filter((t) => t.scenarioId).length,
      });
      return current!;
    }
    for (const framework of ['playwright', 'karate'] as const) {
      for (const [kind, value] of [
        ['suite', undefined],
        ['feature', 'contracts/features/promotions.feature'],
        ['scenario', 'free-shipping'],
        ['tags', '@smoke'],
      ] as const) {
        const run = await runViaUI(framework, kind, value);
        expect(run.tests).toHaveLength(2);
        expect(run.tests.every((t) => t.scenarioId === 'free-shipping')).toBeTruthy();
      }
    }
    // A UI-only defect must never be reported as validated by correct API state.
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByLabel('Application base URL').fill(brokenUrl);
    await page.getByRole('button', { name: 'Save environment', exact: true }).click();
    await runViaUI('playwright', 'suite', undefined, 'FAILED');
    await runViaUI('karate', 'suite', undefined, 'PASSED');
    // Restore ordinary behavior and prove normal UI coverage again.
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByLabel('Application base URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Save environment', exact: true }).click();
    await runViaUI('playwright', 'suite', undefined);
    const configPath = join(targetPath, 'ui/playwright.config.ts');
    const originalConfig = readFileSync(configPath, 'utf8');
    async function trustFixtureRevision() {
      const response = await page.request.get(`${base}/api/targets/${targetId}/trust`, {
        headers: { 'X-QA-Session': proof },
      });
      const fingerprint = ((await response.json()) as { fingerprint: string }).fingerprint;
      expect((await mutate(`/targets/${targetId}/trust`, { fingerprint })).ok()).toBeTruthy();
    }
    for (const kind of ['missing-report', 'malformed-report']) {
      console.log(`Native report boundary: ${kind}`);
      const config =
        kind === 'missing-report'
          ? originalConfig.replace("'results.json'", "'alternate-results.json'")
          : originalConfig +
            `\nimport { writeFileSync } from 'node:fs';\nprocess.on('exit', () => { if (process.env.QA_REPORT_DIR) writeFileSync(resolve(process.env.QA_REPORT_DIR, 'results.json'), '{invalid json'); });\n`;
      writeFileSync(configPath, config);
      await trustFixtureRevision();
      const created = await mutate('/runs', {
        targetId,
        framework: 'playwright',
        selection: { kind: 'suite' },
        baseUrl: demoUrl,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(created.ok()).toBeTruthy();
      const runId = ((await created.json()) as Run).id;
      let result: Run | undefined;
      await expect
        .poll(
          async () => {
            result = (await state()).runs.find((r) => r.id === runId);
            return result?.status;
          },
          { timeout: 90_000 },
        )
        .toBe('FAILED');
      expect(result!.tests).toHaveLength(0);
      expect(result!.error).toMatch(
        kind === 'missing-report' ? /results\.json/ : /JSON|Unexpected/,
      );
      evidence.push({
        framework: 'playwright',
        selection: kind,
        status: result!.status,
        tests: 0,
        durationMs: Date.parse(result!.finishedAt!) - Date.parse(result!.startedAt!),
        idsMapped: 0,
      });
    }
    writeFileSync(configPath, originalConfig);
    await trustFixtureRevision();
    for (const framework of ['playwright', 'karate'] as const) {
      const before = slowRequests;
      const body = {
        targetId,
        framework,
        selection: { kind: 'suite' },
        baseUrl: slowUrl,
        idempotencyKey: crypto.randomUUID(),
      };
      const created = await mutate('/runs', body);
      expect(created.ok()).toBeTruthy();
      const run = (await created.json()) as Run;
      const duplicate = await mutate('/runs', body);
      expect(((await duplicate.json()) as Run).id).toBe(run.id);
      await expect.poll(() => slowRequests, { timeout: 90_000 }).toBeGreaterThan(before);
      const start = performance.now();
      const cancelled = await mutate(`/runs/${run.id}/cancel`, {});
      expect(cancelled.ok()).toBeTruthy();
      await expect
        .poll(async () => (await state()).runs.find((r) => r.id === run.id)?.status, {
          timeout: 10_000,
        })
        .toBe('CANCELLED');
      const final = (await state()).runs.find((r) => r.id === run.id)!;
      expect(performance.now() - start).toBeLessThan(10_000);
      await expect
        .poll(
          () =>
            (final.processGroups || []).some((pid) => {
              try {
                process.kill(-pid, 0);
                return true;
              } catch {
                return false;
              }
            }),
          { timeout: 10_000 },
        )
        .toBe(false);
    }
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
    const all = await state();
    cpSync(join(dataDir, 'runs'), 'test-results/native-runs', { recursive: true });
    expect(all.sources).toHaveLength(2);
    expect(all.sources.filter((source) => source.git?.commit.length === 40)).toHaveLength(1);
    expect(all.sources.flatMap((source) => source.detected)).toEqual(
      expect.arrayContaining(['react', 'fastify']),
    );
    const sorted = samples.toSorted((a, b) => a - b);
    writeFileSync(
      'test-results/phase1-evidence.json',
      JSON.stringify(
        {
          os: process.platform,
          architecture: process.arch,
          node: process.version,
          runs: evidence,
          cancellation: 'Both native frameworks cancelled with process-group cleanup',
          metadataLatency: {
            samples: samples.length,
            p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          },
        },
        null,
        2,
      ),
    );
    await page.goto('about:blank').catch(() => {});
    const unfinished = { ...all.runs[0], id: crypto.randomUUID(), status: 'RUNNING' as const };
    platform.store.put('runs', unfinished);
    await platform.app.close();
    const restarted = createPlatform({ dataDir });
    expect(restarted.store.list('sources')).toHaveLength(2);
    expect(restarted.store.get('runs', unfinished.id)?.status).toBe('INTERRUPTED');
    await restarted.app.close();
  } finally {
    await page.goto('about:blank').catch(() => {});
    await platform.app.close();
    await demo.close();
    await broken.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => slow.close(() => resolve()));
  }
});
