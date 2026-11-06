import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generationFixture } from './helpers/generation.ts';
import { hash } from '../packages/domain/gherkin.ts';
import { targetRevision } from '../packages/generation/staging.ts';
import type { EvolutionJob } from '../packages/evolution/manager.ts';
import { inspectAutomation, inspectInstructions, finding } from '../packages/health/inspect.ts';
const waitJob = async (
  p: ReturnType<typeof generationFixture>,
  id: string,
): Promise<EvolutionJob> => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const job = p.evolution.job(id);
    if (!['RUNNING', 'CANCEL_REQUESTED'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Evolution fixture job did not finish');
};
const evaluate = async (
  p: ReturnType<typeof generationFixture>,
  bundleId: string,
  baselineId?: string,
) => {
  const bundle = p.evolution.repository.get('bundle', bundleId);
  const result = await waitJob(
    p,
    p.evolution.evaluate(bundleId, { expectedHash: bundle.hash, baselineId, trustExecution: true })
      .id,
  );
  assert.equal(result.status, 'SUCCEEDED', result.error);
  const e = result.result as { id: string };
  return p.evolution.repository.get('evaluation', e.id);
};

test('Knowledge ingestion deduplicates, tracks stale content, reviews concise docs and restores exact prior content', async () => {
  const p = generationFixture();
  try {
    const before = targetRevision(p.target.path),
      first = await p.evolution.knowledge.collect(p.target.id);
    assert.ok(first.created > 0);
    const second = await p.evolution.knowledge.collect(p.target.id);
    assert.equal(second.created, 0);
    assert.equal(second.changed, 0);
    assert.equal(targetRevision(p.target.path), before);
    assert.ok(
      p.evolution.metrics().repositoryAnalysis.some((r) => r.reused > 0 && r.cacheHitRatio === 1),
    );
    const k = p.evolution.knowledge
      .records(p.target.id)
      .find((k) => k.key.includes('PromotionsPage'))!;
    const v = k.versions[0];
    assert.equal(
      p.evolution.knowledge.lookup(v.sources[0].ref, v.sources[0].path).length,
      0,
      'Unreviewed data is not retrieved',
    );
    const active = p.evolution.knowledge.review(k.id, k.currentHash, true);
    const doc1 = p.evolution.knowledge.document(active.id).document!;
    assert.equal(hash(doc1.text), doc1.hash);
    assert.equal(p.evolution.knowledge.lookup(v.sources[0].ref, v.sources[0].path).length, 1);
    const page = join(p.target.path, v.sources[0].path),
      text = readFileSync(page, 'utf8');
    writeFileSync(page, text + '\n// meaningful inspected revision fixture\n');
    assert.equal(
      p.evolution.knowledge.records(p.target.id).find((r) => r.id === k.id)!.status,
      'STALE',
    );
    assert.equal(p.evolution.knowledge.lookup(v.sources[0].ref, v.sources[0].path).length, 0);
    const changed = await p.evolution.knowledge.collect(p.target.id);
    assert.ok(changed.changed > 0);
    const updated = p.evolution.repository.get('knowledge', k.id);
    assert.equal(updated.versions.length, 2);
    assert.notEqual(updated.currentHash, k.currentHash);
    p.evolution.knowledge.review(k.id, updated.currentHash, true);
    const doc2 = p.evolution.knowledge.document(k.id).document!;
    assert.notEqual(doc1.hash, doc2.hash);
    assert.throws(
      () =>
        p.evolution.knowledge.restoreDocument(k.id, {
          currentHash: doc1.hash,
          restoreHash: doc1.hash,
        }),
      /changed/,
    );
    p.evolution.knowledge.restoreDocument(k.id, { currentHash: doc2.hash, restoreHash: doc1.hash });
    const restored = p.evolution.knowledge.document(k.id);
    assert.equal(restored.document!.text, doc1.text);
    assert.equal(restored.fresh, false);
    const inferred = p.evolution.knowledge.proposeObservation({
      sourceRecordId: updated.id,
      expectedHash: updated.currentHash,
      classification: 'PROCEDURE',
      claim: 'Synthetic inferred procedure needs confirmation',
      provenance: 'INFERRED',
    });
    assert.throws(
      () => p.evolution.knowledge.review(inferred.id, inferred.currentHash, true),
      /cannot silently/,
    );
    const temporary = p.evolution.knowledge.proposeObservation({
      sourceRecordId: updated.id,
      expectedHash: updated.currentHash,
      classification: 'TEMPORARY',
      claim: 'One-off synthetic observation',
      provenance: 'OBSERVED',
    });
    assert.throws(
      () => p.evolution.knowledge.review(temporary.id, temporary.currentHash, true),
      /cannot silently/,
    );
  } finally {
    await p.app.close();
  }
});

test('Skill bundles execute real deterministic cases, require exact approval, preserve distinct roots and roll back exactly', async () => {
  const p = generationFixture();
  try {
    const b = p.evolution.skills.baseline();
    assert.equal(existsSync(join(p.target.path, '.agents')), false);
    assert.throws(() => p.evolution.skills.prepare(p.target.id, b.id, 'missing'), /unavailable/);
    const untrusted = await waitJob(
      p,
      p.evolution.evaluate(b.id, { expectedHash: b.hash, trustExecution: false }).id,
    );
    assert.equal(untrusted.status, 'FAILED');
    const e = await evaluate(p, b.id);
    assert.equal(e.status, 'PASSED');
    assert.equal(e.cases.length, 8);
    assert.ok(e.cases.every((c) => c.candidate.valid));
    const change = p.evolution.skills.prepare(p.target.id, b.id, e.id);
    assert.equal(existsSync(join(p.target.path, '.agents')), false);
    assert.throws(() => p.evolution.skills.apply(change.id, hash('different')), /exact/);
    p.evolution.skills.apply(change.id, change.hash);
    const root = join(p.target.path, '.agents/skills', b.name);
    const baselineFiles = b.files.map((f) => ({
      path: f.path,
      content: readFileSync(join(root, f.path), 'utf8'),
    }));
    assert.deepEqual(baselineFiles, b.files);
    const candidate = p.evolution.skills.improvement(p.target.id, b.id, [
      'health:controlled-first',
      'health:controlled-second',
    ]);
    // The public orchestrator separately validates actual health history before this lower-level proposal builder.
    assert.throws(() => p.evolution.improvement(p.target.id, b.id), /real read-only/);
    const comparison = await evaluate(p, candidate.id, b.id);
    assert.equal(comparison.status, 'PASSED');
    assert.ok(comparison.comparison.candidateBytes < comparison.comparison.baselineBytes!);
    const next = p.evolution.skills.prepare(p.target.id, candidate.id, comparison.id);
    p.evolution.skills.apply(next.id, next.hash);
    assert.equal(p.evolution.repository.list('active')[0].hash, candidate.hash);
    const revert = p.evolution.skills.prepare(p.target.id, b.id, e.id, true);
    p.evolution.skills.apply(revert.id, revert.hash);
    assert.equal(p.evolution.repository.list('active')[0].hash, b.hash);
    assert.deepEqual(
      b.files.map((f) => ({ path: f.path, content: readFileSync(join(root, f.path), 'utf8') })),
      baselineFiles,
    );
    assert.equal(
      readdirSync(p.evolution.skills.directory).some((n) => n.startsWith('eval-')),
      false,
      'Temporary evaluator input/script files removed',
    );
    assert.ok(p.evolution.metrics().skillInvocations >= 24);
  } finally {
    await p.app.close();
  }
});

test('Rejected/unvalidated bundles, stale bases, source destinations and symlinks cannot change active instructions', async () => {
  const p = generationFixture();
  try {
    const b = p.evolution.skills.baseline(),
      e = await evaluate(p, b.id);
    const c = p.evolution.skills.prepare(p.target.id, b.id, e.id);
    p.evolution.skills.reject(c.id, c.hash);
    assert.throws(() => p.evolution.skills.apply(c.id, c.hash), /exact/);
    const stale = p.evolution.skills.prepare(p.target.id, b.id, e.id);
    writeFileSync(join(p.target.path, 'ui/pages/NewPage.ts'), 'export class NewPage {}');
    assert.throws(() => p.evolution.skills.apply(stale.id, stale.hash), /changed/);
    assert.equal(existsSync(join(p.target.path, '.agents')), false);
    assert.throws(() => p.evolution.skills.prepare(p.source.id, b.id, e.id), /Target not found/);
    const alias = p.evolution.skills.prepare(p.target.id, b.id, e.id);
    symlinkSync(p.source.path, join(p.target.path, '.agents'), 'dir');
    assert.throws(() => p.evolution.skills.apply(alias.id, alias.hash), /symlink|alias/);
    assert.equal(existsSync(join(p.source.path, 'skills')), false);
    const other = p.evolution.skills.propose({
      name: 'unsupported-procedure',
      version: 'v1',
      files: [
        {
          path: 'SKILL.md',
          content:
            '---\nname: unsupported-procedure\ndescription: Review supplied safe evidence.\n---\nRead the input.',
        },
      ],
      problem: 'Synthetic unsupported case',
      benefit: 'Needs an actual evaluator',
      evidence: [],
    });
    assert.equal(other.evaluator, null);
    const evalJob = await waitJob(
      p,
      p.evolution.evaluate(other.id, { expectedHash: other.hash, trustExecution: true }).id,
    );
    assert.equal(evalJob.status, 'FAILED');
    p.evolution.skills.rejectBundle(other.id, other.hash);
    assert.throws(() => p.evolution.skills.prepare(p.target.id, other.id, e.id), /passing/);
    assert.throws(
      () =>
        p.evolution.skills.propose({
          ...other,
          files: [{ path: '../AGENTS.md', content: 'overwrite instructions' }],
        }),
      /path/,
    );
  } finally {
    await p.app.close();
  }
});

test('Autohealth rules expose evidence, stable fingerprints and heuristic limits on versioned fixtures', () => {
  const root = 'synthetic-target';
  const files = [
    {
      path: 'contracts/features/broken.feature',
      text: 'not a valid Gherkin feature',
    },
    {
      path: 'ui/pages/BrittlePage.ts',
      text: 'export class BrittlePage { click() { this.page.locator("div > a").nth(2).click({force: true}); } }',
    },
    { path: 'ui/playwright.config.ts', text: 'export default {' },
  ];
  const findings = inspectAutomation(root, files, undefined, [], 2000);
  assert.ok(findings.some((f) => f.code === 'INVALID_GHERKIN'));
  assert.ok(
    findings.some((f) => f.code === 'BRITTLE_SELECTOR_CANDIDATE' && f.confidence === 'HEURISTIC'),
  );
  assert.ok(findings.some((f) => f.code === 'INVALID_RUNNER_CONFIG'));
  const a = finding('X', root, 'WARNING', ['first evidence'], 'review', 'location'),
    b = finding('X', root, 'WARNING', ['new evidence'], 'review', 'location');
  assert.equal(a.fingerprint, b.fingerprint);
  const instructions = inspectInstructions(
    root,
    'AGENTS.md',
    'Require explicit approval. Never ask for approval.\n' + 'long instruction '.repeat(600),
  );
  assert.ok(instructions.some((f) => f.code === 'OVERSIZED_INSTRUCTIONS'));
  assert.ok(instructions.some((f) => f.code === 'CONTRADICTORY_INSTRUCTIONS_CANDIDATE'));
});

test('Read-only health history and local scheduler handle cancellation, pause, overlap and unavailable targets honestly', async () => {
  const p = generationFixture();
  try {
    const before = targetRevision(p.target.path);
    const run = p.evolution.health.start(p.target.id);
    assert.throws(() => p.evolution.health.start(p.target.id), /One health/);
    p.evolution.health.cancel(run.id);
    let end = Date.now() + 10000;
    while (Date.now() < end && p.evolution.health.repository.run(run.id).status !== 'CANCELLED')
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(p.evolution.health.repository.run(run.id).status, 'CANCELLED');
    assert.equal(targetRevision(p.target.path), before);
    const schedule = p.evolution.health.schedule({
      targetId: p.target.id,
      enabled: true,
      intervalMinutes: 1,
      slowSetupMs: 2000,
    });
    await p.evolution.health.tick(Date.parse(schedule.nextAt!));
    const started = p.evolution.health.repository.schedules()[0];
    assert.ok(started.lastRunId);
    await p.evolution.health.tick(Date.parse(started.nextAt!));
    assert.ok(p.evolution.health.repository.schedules()[0].skippedOverlap >= 1);
    end = Date.now() + 10000;
    while (
      Date.now() < end &&
      p.evolution.health.repository.run(started.lastRunId!).status === 'RUNNING'
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(p.evolution.health.repository.run(started.lastRunId!).origin, 'SCHEDULED');
    const health = p.evolution.health.repository.run(started.lastRunId!);
    assert.equal(health.status, 'SUCCEEDED');
    assert.ok(health.findings.some((f) => f.code === 'DEPENDENCY_MISSING'));
    const paused = p.evolution.health.schedule({
      targetId: p.target.id,
      enabled: false,
      intervalMinutes: 1,
      slowSetupMs: 2000,
    });
    assert.equal(paused.nextAt, null);
    assert.equal(targetRevision(p.target.path), before);
  } finally {
    await p.app.close();
  }
});

test('Metrics retain recorded attempt denominators, classify custom providers and keep unavailable tokens null', async () => {
  const p = generationFixture();
  try {
    const baseline = p.evolution.metrics();
    assert.equal(baseline.generation.rate, null);
    assert.equal(baseline.maintenance.rate, null);
    p.generation.repository.put('tasks', {
      id: 'synthetic-metrics',
      kind: 'implementation',
      status: 'CANCELLED',
      targetId: p.target.id,
      recordingId: p.recordingId,
      createdAt: new Date().toISOString(),
      events: [],
      contextFiles: [],
      retrievalBytes: 120,
      promptBytes: 300,
      toolCalls: 2,
      model: 'fixture-only',
      usage: null,
      executionClass: 'CUSTOM',
      searches: [
        { queryHash: 'a', scopeHash: 'same' },
        { queryHash: 'a', scopeHash: 'same' },
        { queryHash: 'a', scopeHash: 'changed' },
      ],
    });
    const metrics = p.evolution.metrics();
    assert.equal(metrics.generation.denominator, 1);
    assert.equal(metrics.generation.numerator, 0);
    assert.equal(metrics.states.CANCELLED, 1);
    assert.equal(metrics.tasks[0].repeatedQueries, 1);
    assert.equal(metrics.tasks[0].providerTokens.input, null);
    assert.equal(metrics.tasks[0].proxy.contextBytes, 420);
    assert.equal(metrics.tasks[0].executionClass, 'CUSTOM');
  } finally {
    await p.app.close();
  }
});

test('Evolution and health endpoints require session/CSRF, bounded requests and no arbitrary execution/schedule paths', async () => {
  const p = generationFixture();
  try {
    assert.equal((await p.app.inject('/api/evolution/state')).statusCode, 401);
    assert.equal((await p.app.inject('/api/health/state')).statusCode, 401);
    const login = await p.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { host: 'localhost', origin: 'http://localhost' },
      payload: { token: p.launchToken },
    });
    const headers = {
      host: 'localhost',
      cookie: String(login.headers['set-cookie']).split(';')[0],
      'x-qa-session': login.json().proof,
      'x-qa-csrf': '',
    };
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/evolution/skills/baseline',
          headers,
          payload: {},
        })
      ).statusCode,
      403,
    );
    const state = await p.app.inject({ url: '/api/state', headers });
    headers['x-qa-csrf'] = state.json().csrf;
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/health/schedule',
          headers,
          payload: { enabled: true, intervalMinutes: 0, slowSetupMs: 2000 },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/health/runs',
          headers,
          payload: { targetId: p.target.id, slowSetupMs: 2000, command: 'rm -rf' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/evolution/skills/baseline',
          headers,
          payload: { destination: p.source.path },
        })
      ).statusCode,
      400,
    );
  } finally {
    await p.app.close();
  }
});

test('Versioned health labels measure false-positive/negative counts on supported positive and held-out negative cases', () => {
  const dataset = JSON.parse(
    readFileSync('docs/evaluations/fixtures/phase-6-health-v1.json', 'utf8'),
  ) as {
    cases: {
      id: string;
      kind: string;
      files?: { path: string; text: string }[];
      text?: string;
      expectedCodes: string[];
    }[];
  };
  let falsePositives = 0,
    falseNegatives = 0;
  for (const c of dataset.cases) {
    const findings =
      c.kind === 'instructions'
        ? inspectInstructions('fixture', 'AGENTS.md', c.text!)
        : inspectAutomation('fixture', c.files!, undefined, [], 2000);
    const actual = [...new Set(findings.map((f) => f.code))];
    falsePositives += actual.filter((code) => !c.expectedCodes.includes(code)).length;
    falseNegatives += c.expectedCodes.filter((code) => !actual.includes(code)).length;
    assert.deepEqual(actual.sort(), [...c.expectedCodes].sort(), c.id);
  }
  assert.equal(falsePositives, 0);
  assert.equal(falseNegatives, 0);
});

test('Health reports slow/flaky heuristics, stale indexes, missing artifacts and unvalidated duplicate skills without repo writes', async () => {
  const p = generationFixture();
  try {
    await p.generation.index.scan({ kind: 'target', id: p.target.id });
    const b = p.evolution.skills.baseline();
    p.evolution.skills.propose({
      name: b.name,
      version: b.version,
      files: b.files,
      problem: 'Synthetic duplicate candidate',
      benefit: 'Measure duplicate candidate diagnostics',
      evidence: [],
    });
    const feature = p.workspace.features(p.target)[0];
    const base = {
      targetId: p.target.id,
      framework: 'playwright' as const,
      selection: { kind: 'feature' as const, value: feature.path },
      createdAt: new Date().toISOString(),
      baseUrl: 'http://127.0.0.1:4311',
      snapshot: [{ path: feature.path, hash: feature.hash, scenarios: feature.scenarios }],
      executableHash: p.workspace.fingerprint(p.target),
    };
    for (const [i, status] of ['PASSED', 'FAILED'].entries())
      p.store.put('runs', {
        ...base,
        id: `synthetic-health-${i}`,
        idempotencyKey: `health-${i}`,
        status: status as 'PASSED' | 'FAILED',
        artifacts: [{ name: 'results.json', size: 1, hash: hash('missing') }],
        tests: [
          {
            nativeId: 'synthetic-unit-only',
            name: 'Same controlled fixture example',
            status,
            scenarioId: 'free-shipping',
            featurePath: feature.path,
            row: 1,
            durationMs: 12000,
            steps: [{ name: 'Given setup', durationMs: 12000, status: 'PASSED' }],
          },
        ],
      });
    writeFileSync(join(p.target.path, 'ui/pages/AddedPage.ts'), 'export class AddedPage {}');
    const before = targetRevision(p.target.path),
      run = p.evolution.health.start(p.target.id);
    const end = Date.now() + 10000;
    while (Date.now() < end && p.evolution.health.repository.run(run.id).status === 'RUNNING')
      await new Promise((r) => setTimeout(r, 10));
    const actual = p.evolution.health.repository.run(run.id);
    assert.equal(actual.status, 'SUCCEEDED');
    for (const code of [
      'INDEX_STALE',
      'ARTIFACT_MISSING',
      'SLOW_SETUP_CANDIDATE',
      'FLAKY_SCENARIO_CANDIDATE',
      'UNVALIDATED_SKILL',
      'DUPLICATE_SKILL_CANDIDATE',
      'UNUSED_SKILL_CANDIDATE',
    ])
      assert.ok(
        actual.findings.some((f) => f.code === code),
        code,
      );
    assert.equal(targetRevision(p.target.path), before);
  } finally {
    await p.app.close();
  }
});

test('Cancelling a real evaluator attempt records cancellation, creates no passing evaluation and removes temporary files', async () => {
  const p = generationFixture();
  try {
    const b = p.evolution.skills.baseline(),
      job = p.evolution.evaluate(b.id, { expectedHash: b.hash, trustExecution: true });
    const deadline = Date.now() + 5000;
    while (
      Date.now() < deadline &&
      !p.store.db.prepare("SELECT id FROM evolution_activity WHERE kind='skillInvocation'").get()
    )
      await new Promise((r) => setTimeout(r, 5));
    p.evolution.cancel(job.id);
    const result = await waitJob(p, job.id);
    assert.equal(result.status, 'CANCELLED');
    assert.equal(p.evolution.repository.list('evaluation').length, 0);
    const activities = p.store.db
      .prepare("SELECT data FROM evolution_activity WHERE kind='skillInvocation'")
      .all() as { data: string }[];
    assert.ok(activities.some((a) => JSON.parse(a.data).status === 'CANCELLED'));
    assert.equal(
      readdirSync(p.evolution.skills.directory).some((n) => n.startsWith('eval-')),
      false,
    );
  } finally {
    await p.app.close();
  }
});

test('Restart preserves interrupted job evidence and missed schedules without replaying checks', async () => {
  const { createPlatform } = await import('../apps/server/app.ts');
  const p = generationFixture();
  const schedule = p.evolution.health.schedule({
    targetId: p.target.id,
    enabled: true,
    intervalMinutes: 1,
    slowSetupMs: 2000,
  });
  p.evolution.health.repository.schedule({
    ...schedule,
    nextAt: new Date(Date.now() - 180000).toISOString(),
  });
  p.evolution.health.repository.put({
    id: 'synthetic-interrupted-health',
    targetId: p.target.id,
    origin: 'MANUAL',
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
    checks: [],
    findings: [],
  });
  p.store.db.prepare('INSERT INTO evolution_jobs VALUES (?,?)').run(
    'synthetic-interrupted-job',
    JSON.stringify({
      id: 'synthetic-interrupted-job',
      kind: 'EVALUATE',
      status: 'RUNNING',
      createdAt: new Date().toISOString(),
    }),
  );
  await p.app.close();
  const restarted = createPlatform({ dataDir: join(p.root, 'private') });
  try {
    assert.equal(restarted.evolution.job('synthetic-interrupted-job').status, 'INTERRUPTED');
    assert.equal(
      restarted.evolution.health.repository.run('synthetic-interrupted-health').status,
      'INTERRUPTED',
    );
    const restored = restarted.evolution.health.repository.schedules()[0];
    assert.ok(restored.missed >= 3);
    assert.ok(Date.parse(restored.nextAt!) > Date.now());
    assert.equal(restarted.evolution.health.repository.runs().length, 1);
    restarted.store.db.prepare('DELETE FROM targets WHERE id=?').run(p.target.id);
    await restarted.evolution.health.tick(Date.parse(restored.nextAt!));
    assert.match(
      restarted.evolution.health.repository.schedules()[0].lastError!,
      /could not start/,
    );
  } finally {
    await restarted.app.close();
  }
});

test('Obsolete instruction references remain sourced heuristic findings without probing imported filesystem paths', () => {
  const findings = inspectInstructions(
    'fixture',
    'SKILL.md',
    'Use source:deleted-registration. Example target:also-missing is historical.',
    ['source:current'],
  );
  assert.equal(
    findings.filter((f) => f.code === 'OBSOLETE_REPOSITORY_REFERENCE_CANDIDATE').length,
    2,
  );
  assert.ok(findings.every((f) => f.confidence === 'HEURISTIC'));
});

test('Approved knowledge is retrieved only for matching authorized files; revocation invalidates the actual generation task', async () => {
  const { fixtureProvider, finished } = await import('./helpers/generation.ts');
  let revoke: () => void = () => {};
  let sawAdvisory = false;
  const p = generationFixture({
    async run(request) {
      const hits = (await request.onTool('qa_lookup', { query: 'PromotionsPage promotions' })) as {
        path: string;
        advisoryKnowledge?: { id: string; advisoryOnly: boolean }[];
      }[];
      sawAdvisory = hits.some(
        (h) =>
          h.path === 'ui/pages/PromotionsPage.ts' &&
          h.advisoryKnowledge?.some((k) => k.advisoryOnly),
      );
      revoke();
      return fixtureProvider.run(request);
    },
  });
  try {
    await p.evolution.knowledge.collect(p.target.id);
    const k = p.evolution.knowledge
      .records(p.target.id)
      .find((k) => k.key.includes('PromotionsPage.ts:page'))!;
    p.evolution.knowledge.review(k.id, k.currentHash, true);
    assert.equal(
      p.evolution.knowledge.lookup({ kind: 'source', id: p.source.id }, 'Promotions.tsx').length,
      0,
    );
    revoke = () => {
      p.evolution.knowledge.review(k.id, k.currentHash, false);
    };
    const task = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: p.recordingId,
          featurePath: 'contracts/features/promotions.feature',
          sourceIds: [p.source.id],
        })
      ).id,
    );
    assert.equal(sawAdvisory, true);
    assert.equal(task.status, 'FAILED');
    assert.match(task.error!, /knowledge approval\/content changed/);
    assert.ok(task.knowledgeRefs?.some((r) => r.id === k.id));
    assert.equal(task.executionClass, 'CUSTOM');
    assert.equal(p.generation.repository.list('contracts').length, 0);
  } finally {
    await p.app.close();
  }
});

test('Temporary observations expire under configured retention without deleting reviewed repository knowledge', async () => {
  const p = generationFixture();
  try {
    await p.evolution.knowledge.collect(p.target.id);
    const source = p.evolution.knowledge.records(p.target.id)[0];
    p.evolution.knowledge.review(source.id, source.currentHash, true);
    const temp = p.evolution.knowledge.proposeObservation({
      sourceRecordId: source.id,
      expectedHash: source.currentHash,
      classification: 'TEMPORARY',
      claim: 'Ephemeral one-off fixture',
      provenance: 'OBSERVED',
    });
    temp.versions[0].createdAt = new Date(Date.now() - 15 * 86400000).toISOString();
    p.evolution.repository.put('knowledge', temp);
    assert.ok(!p.evolution.knowledge.records(p.target.id).some((k) => k.id === temp.id));
    assert.equal(p.evolution.repository.get('knowledge', source.id).status, 'ACTIVE');
    assert.ok(p.evolution.knowledge.document(source.id).document);
  } finally {
    await p.app.close();
  }
});

test('Recorded provider totals retain cached/reasoning subsets without summing them twice', async () => {
  const p = generationFixture();
  try {
    p.generation.repository.put('tasks', {
      id: 'synthetic-token-categories',
      kind: 'analysis',
      status: 'SUCCEEDED',
      targetId: p.target.id,
      recordingId: p.recordingId,
      createdAt: new Date().toISOString(),
      events: [],
      contextFiles: [],
      retrievalBytes: 0,
      promptBytes: 0,
      toolCalls: 0,
      model: 'fixture-only',
      executionClass: 'CUSTOM',
      usage: {
        total: {
          inputTokens: 50,
          cachedInputTokens: 10,
          outputTokens: 7,
          reasoningOutputTokens: 3,
          totalTokens: 57,
        },
        last: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
    });
    const token = p.evolution.metrics().tasks[0].providerTokens;
    assert.equal(token.total, 57);
    assert.equal(token.reasoningOutput, 3);
    assert.equal(token.cachedInput, 10);
    assert.equal(p.evolution.metrics().tasks[0].executionClass, 'CUSTOM');
  } finally {
    await p.app.close();
  }
});

test('A real staging-path conflict cannot publish a partial instruction bundle or alter the prior active version', async () => {
  const { mkdirSync } = await import('node:fs');
  const p = generationFixture();
  try {
    const baseline = p.evolution.skills.baseline(),
      e = await evaluate(p, baseline.id);
    const first = p.evolution.skills.prepare(p.target.id, baseline.id, e.id);
    p.evolution.skills.apply(first.id, first.hash);
    const candidate = p.evolution.skills.improvement(p.target.id, baseline.id, [
      'health:synthetic-one',
      'health:synthetic-two',
    ]);
    const comparison = await evaluate(p, candidate.id, baseline.id);
    const change = p.evolution.skills.prepare(p.target.id, candidate.id, comparison.id);
    const reserved = join(p.target.path, '.agents', '.qa-skill-stage-' + change.id);
    mkdirSync(reserved);
    writeFileSync(join(reserved, 'unknown.txt'), 'existing unreviewed content');
    assert.throws(() => p.evolution.skills.apply(change.id, change.hash));
    assert.equal(p.evolution.repository.get('skillChange', change.id).status, 'FAILED');
    assert.equal(p.evolution.repository.list('active')[0].hash, baseline.hash);
    const active = join(p.target.path, '.agents/skills', baseline.name);
    assert.deepEqual(
      baseline.files.map((f) => ({
        path: f.path,
        content: readFileSync(join(active, f.path), 'utf8'),
      })),
      baseline.files,
    );
    assert.equal(
      readFileSync(join(reserved, 'unknown.txt'), 'utf8'),
      'existing unreviewed content',
    );
  } finally {
    await p.app.close();
  }
});
