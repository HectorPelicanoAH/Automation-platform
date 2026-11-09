import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generationFixture, completeSteps } from './helpers/generation.ts';
import { demoApp } from '../apps/demo/app.ts';
import type { SkillEvaluation } from '../packages/evolution/model.ts';
import type { EvolutionJob } from '../packages/evolution/manager.ts';
import { targetRevision } from '../packages/generation/staging.ts';
const exec = promisify(execFile);

test('Knowledge and Autohealth: actual native discovery, dedupe/staleness/docs, scheduled read-only checks and evaluated reversible skills', async ({
  page,
}) => {
  const p = generationFixture(),
    demo = demoApp();
  p.generation.repository.settings({ ...p.generation.repository.settings(), enabled: false });
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  p.store.settings({ baseUrl: demoUrl, retentionDays: 14 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  const jobResult = async (kind: EvolutionJob['kind'], previousId?: string) => {
    await expect
      .poll(() => p.evolution.jobs().find((j) => j.kind === kind && j.id !== previousId)?.status, {
        timeout: 30000,
      })
      .toBe('SUCCEEDED');
    return p.evolution.jobs().find((j) => j.kind === kind && j.id !== previousId)!;
  };
  const approveSelectedSkill = async () => {
    await page.getByRole('button', { name: 'Prepare reviewed skill change', exact: true }).click();
    await expect(page.getByLabel('Skill activation diff')).toContainText(
      '.agents/skills/summarize-health-findings',
    );
    await expect(
      page.getByRole('button', { name: 'Apply approved skill change', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('I approve this exact active skill change on the selected target')
      .check();
    await page.getByRole('button', { name: 'Apply approved skill change', exact: true }).click();
    await expect.poll(() => p.evolution.repository.list('skillChange')[0]?.status).toBe('APPLIED');
  };
  try {
    writeFileSync(join(p.target.path, 'ui/steps/promotions.ts'), completeSteps);
    const pnpm = process.env.QA_PNPM_CLI,
      args = ['--dir', join(p.target.path, 'ui'), 'install', '--frozen-lockfile'];
    if (process.env.QA_PNPM_STORE) args.push('--store-dir', process.env.QA_PNPM_STORE);
    await exec(pnpm ? process.execPath : 'pnpm', pnpm ? [pnpm, ...args] : args, {
      env: { ...process.env, CI: 'true' },
      timeout: 180000,
      maxBuffer: 4000000,
    });
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Runs', exact: true }).click();
    await page.getByRole('button', { name: 'Trust this project fingerprint', exact: true }).click();
    await page.getByRole('button', { name: '▷ Start run', exact: true }).click();
    await expect.poll(() => p.store.list('runs')[0]?.status, { timeout: 90000 }).toBe('PASSED');
    const native = p.store.list('runs')[0];
    expect(native.tests).toHaveLength(2);
    expect(native.tests.every((t) => t.status === 'PASSED')).toBe(true);
    await expect
      .poll(
        () =>
          p.evolution.knowledge
            .records(p.target.id)
            .some((k) => k.versions.some((v) => v.confidence === 'NATIVE')),
        { timeout: 15000 },
      )
      .toBe(true);
    const automatic = p.evolution.jobs().find((j) => j.kind === 'COLLECT')!;
    expect(automatic.status).toBe('SUCCEEDED');
    await page.getByRole('button', { name: 'Knowledge & Skills', exact: true }).click();
    const nativeRecord = p.evolution.knowledge
      .records(p.target.id)
      .find((k) => k.versions.some((v) => v.confidence === 'NATIVE'))!;
    await page.getByLabel('Knowledge record').selectOption(nativeRecord.id);
    await page
      .getByRole('button', { name: 'Approve fact and publish concise documentation', exact: true })
      .click();
    await expect(page.getByLabel('Knowledge documentation')).toContainText(
      'passing visible UI native evidence',
    );
    const count = p.evolution.knowledge.records(p.target.id).length;
    const previousCollection = automatic.id;
    await page
      .getByRole('button', { name: 'Collect current workflow knowledge', exact: true })
      .click();
    const repeat = await jobResult('COLLECT', previousCollection);
    expect((repeat.result as { created: number; changed: number }).created).toBe(0);
    expect((repeat.result as { changed: number }).changed).toBe(0);
    expect(p.evolution.knowledge.records(p.target.id)).toHaveLength(count);
    const pageRecord = p.evolution.knowledge
      .records(p.target.id)
      .find((k) => k.key.startsWith('capability:ui/pages/PromotionsPage.ts:page:'))!;
    await page.getByLabel('Knowledge record').selectOption(pageRecord.id);
    await page
      .getByRole('button', { name: 'Approve fact and publish concise documentation', exact: true })
      .click();
    await expect(page.getByLabel('Knowledge documentation')).toContainText('PromotionsPage');
    const firstDoc = p.evolution.knowledge.document(pageRecord.id).document!;
    const pageFile = join(p.target.path, 'ui/pages/PromotionsPage.ts');
    writeFileSync(
      pageFile,
      readFileSync(pageFile, 'utf8') + '\n// controlled knowledge freshness revision\n',
    );
    await page.getByRole('button', { name: 'Refresh knowledge', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: 'Approve fact and publish concise documentation',
        exact: true,
      }),
    ).toBeDisabled();
    const oldCollect = p.evolution.jobs().find((j) => j.kind === 'COLLECT')!.id;
    await page
      .getByRole('button', { name: 'Collect current workflow knowledge', exact: true })
      .click();
    await jobResult('COLLECT', oldCollect);
    await expect(
      page.getByRole('button', {
        name: 'Approve fact and publish concise documentation',
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Approve fact and publish concise documentation', exact: true })
      .click();
    await expect.poll(() => p.evolution.knowledge.document(pageRecord.id).history.length).toBe(2);
    const secondDoc = p.evolution.knowledge.document(pageRecord.id).document!;
    expect(secondDoc.hash).not.toBe(firstDoc.hash);
    await page.getByLabel('Prior documentation version').selectOption(firstDoc.hash);
    await page.getByLabel('I approve restoring this exact private documentation version').check();
    await page.getByRole('button', { name: 'Restore reviewed documentation', exact: true }).click();
    await expect
      .poll(() => p.evolution.knowledge.document(pageRecord.id).document?.hash)
      .toBe(firstDoc.hash);
    expect(p.evolution.knowledge.document(pageRecord.id).fresh).toBe(false);
    await page.getByRole('button', { name: 'Autohealth', exact: true }).click();
    const beforeHealth = targetRevision(p.target.path);
    const manualHealthIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const previous = p.evolution.health.repository.runs()[0]?.id;
      await page.getByRole('button', { name: 'Run read-only health checks', exact: true }).click();
      await expect
        .poll(() => p.evolution.health.repository.runs().find((r) => r.id !== previous)?.status, {
          timeout: 15000,
        })
        .toBe('SUCCEEDED');
      manualHealthIds.push(p.evolution.health.repository.runs()[0].id);
    }
    expect(targetRevision(p.target.path)).toBe(beforeHealth);
    expect(
      p.evolution.health.repository
        .runs()[0]
        .findings.some((f) => f.code === 'DOCUMENT_STALE' || f.code === 'KNOWLEDGE_STALE'),
    ).toBe(true);
    await page.getByText('Local schedule and thresholds', { exact: true }).click();
    await page.getByLabel('Enable local scheduled read-only checks').check();
    await page.getByLabel('Health interval in minutes').fill('1');
    await page.getByRole('button', { name: 'Save local health schedule', exact: true }).click();
    await expect.poll(() => p.evolution.health.repository.schedules()[0]?.enabled).toBe(true);
    const schedule = p.evolution.health.repository.schedules()[0];
    await p.evolution.health.tick(Date.parse(schedule.nextAt!));
    await expect
      .poll(
        () => p.evolution.health.repository.runs().find((r) => r.origin === 'SCHEDULED')?.status,
        { timeout: 15000 },
      )
      .toBe('SUCCEEDED');
    await page.getByLabel('Enable local scheduled read-only checks').uncheck();
    await page.getByRole('button', { name: 'Save local health schedule', exact: true }).click();
    await expect.poll(() => p.evolution.health.repository.schedules()[0].enabled).toBe(false);
    expect(targetRevision(p.target.path)).toBe(beforeHealth);
    await page.screenshot({ path: 'test-results/phase6-autohealth.png', fullPage: true });
    await page.getByRole('button', { name: 'Knowledge & Skills', exact: true }).click();
    await page
      .getByRole('button', { name: 'Propose portable summary baseline', exact: true })
      .click();
    const baseline = p.evolution.repository.list('bundle')[0];
    expect(existsSync(join(p.target.path, '.agents'))).toBe(false);
    await page.getByLabel('I trust this exact packaged evaluator for local execution').check();
    await page
      .getByRole('button', { name: 'Evaluate exact bundle against versioned cases', exact: true })
      .click();
    const baselineJob = await jobResult('EVALUATE');
    const baselineEval = baselineJob.result as SkillEvaluation;
    expect(baselineEval.status).toBe('PASSED');
    await expect(page.getByLabel('Skill evaluation')).toContainText('DETERMINISTIC_SCRIPT');
    await approveSelectedSkill();
    expect(p.evolution.repository.list('active')[0].hash).toBe(baseline.hash);
    const activeRoot = join(p.target.path, '.agents/skills/summarize-health-findings');
    const originalBundle = baseline.files.map((f) => ({
      path: f.path,
      content: readFileSync(join(activeRoot, f.path), 'utf8'),
    }));
    expect(originalBundle).toEqual(baseline.files);
    await page.getByLabel('I trust this exact packaged evaluator for local execution').check();
    await page
      .getByRole('button', { name: 'Run active summary on recent health evidence', exact: true })
      .click();
    const baselineSummary = await jobResult('SUMMARIZE');
    await page
      .getByRole('button', {
        name: 'Propose improvement from repeated health evidence',
        exact: true,
      })
      .click();
    const candidate = p.evolution.repository.list('bundle').find((b) => b.version === 'v2')!;
    expect(candidate.parentId).toBe(baseline.id);
    expect(candidate.evidence.length).toBeGreaterThanOrEqual(2);
    await page.getByLabel('I trust this exact packaged evaluator for local execution').check();
    await page
      .getByRole('button', { name: 'Evaluate exact bundle against versioned cases', exact: true })
      .click();
    const candidateJob = await jobResult('EVALUATE', baselineJob.id),
      comparison = candidateJob.result as SkillEvaluation;
    expect(comparison.status).toBe('PASSED');
    expect(comparison.comparison.candidateBytes).toBeLessThan(comparison.comparison.baselineBytes!);
    await expect(page.getByLabel('Skill evaluation')).toContainText(candidate.hash);
    await approveSelectedSkill();
    expect(p.evolution.repository.list('active')[0].hash).toBe(candidate.hash);
    await page.getByLabel('I trust this exact packaged evaluator for local execution').check();
    await page
      .getByRole('button', { name: 'Run active summary on recent health evidence', exact: true })
      .click();
    const candidateSummary = await jobResult('SUMMARIZE', baselineSummary.id);
    const a = baselineSummary.result as {
        workflowIds: string[];
        inputCount: number;
        outputBytes: number;
      },
      b = candidateSummary.result as {
        workflowIds: string[];
        inputCount: number;
        outputBytes: number;
      };
    expect(b.workflowIds).toEqual(a.workflowIds);
    expect(b.inputCount).toBe(a.inputCount);
    expect(b.outputBytes).toBeLessThan(a.outputBytes);
    // Independently run the installed portable skill helper without the web app/database.
    const inputFile = join(p.root, 'portable-input.json');
    writeFileSync(
      inputFile,
      JSON.stringify([
        { root: 'portable-fixture', fingerprint: 'x', severity: 'WARNING', evidence: ['first'] },
        { root: 'portable-fixture', fingerprint: 'x', severity: 'WARNING', evidence: ['second'] },
      ]),
    );
    const portable = await exec(
      process.execPath,
      [join(activeRoot, 'scripts/summarize.mjs'), inputFile],
      { timeout: 5000, maxBuffer: 64000 },
    );
    expect(JSON.parse(portable.stdout).findings).toHaveLength(1);
    expect(JSON.parse(portable.stdout).findings[0].occurrences).toBe(2);
    await page.getByLabel('Skill bundle').selectOption(baseline.id);
    await page.getByLabel('Prepare as rollback to a previously approved bundle').check();
    await approveSelectedSkill();
    expect(p.evolution.repository.list('active')[0].hash).toBe(baseline.hash);
    expect(
      baseline.files.map((f) => ({
        path: f.path,
        content: readFileSync(join(activeRoot, f.path), 'utf8'),
      })),
    ).toEqual(originalBundle);
    await page.getByRole('button', { name: 'Inspect portable export', exact: true }).click();
    await expect(page.getByLabel('Portable skill export')).toContainText('SKILL.md');
    expect(
      readdirSync(join(p.target.path, '.agents')).filter((name) => name.startsWith('.qa-skill-')),
    ).toEqual([]);
    expect(p.evolution.metrics().tasks).toHaveLength(0);
    expect(p.evolution.metrics().skillInvocations).toBe(26);
    expect(browserErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/phase6-knowledge-skills.png', fullPage: true });
    writeFileSync(
      'test-results/phase6-live-workflow.json',
      JSON.stringify(
        {
          source:
            'Actual native Playwright target run, automatic knowledge ingestion, real fixed-script evaluations and owned synthetic web/API QA actor approvals; no provider inference or user/global skill changes.',
          nativeRun: native,
          automatic,
          knowledge: {
            nativeRecordId: nativeRecord.id,
            pageRecordId: pageRecord.id,
            firstDocumentHash: firstDoc.hash,
            secondDocumentHash: secondDoc.hash,
            restoredDocumentHash: p.evolution.knowledge.document(pageRecord.id).document!.hash,
            restoredFresh: p.evolution.knowledge.document(pageRecord.id).fresh,
          },
          health: p.evolution.health.repository.runs(),
          schedules: p.evolution.health.repository.schedules(),
          baseline,
          candidate,
          baselineEvaluation: baselineEval,
          comparison,
          baselineSummary: baselineSummary.result,
          candidateSummary: candidateSummary.result,
          changes: p.evolution.repository.list('skillChange'),
          active: p.evolution.repository.list('active'),
          portableOutput: JSON.parse(portable.stdout),
          metrics: p.evolution.metrics(),
          browserErrors,
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
