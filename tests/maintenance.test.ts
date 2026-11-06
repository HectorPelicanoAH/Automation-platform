import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, symlinkSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generationFixture, completeSteps, featurePath } from './helpers/generation.ts';
import type { Run } from '../packages/domain/model.ts';
import { failureHypotheses } from '../packages/maintenance/manager.ts';
import { replaceLocator } from '../packages/maintenance/locator.ts';
import { relationships, recentChanges } from '../packages/intelligence/relationships.ts';
import { targetRevision } from '../packages/generation/staging.ts';
import { hash } from '../packages/domain/gherkin.ts';

const pagePath = 'ui/pages/PromotionsPage.ts';
const original = readFileSync(resolve('templates/automation/' + pagePath), 'utf8');
export function failedFixture(p: ReturnType<typeof generationFixture>) {
  writeFileSync(join(p.target.path, 'ui/steps/promotions.ts'), completeSteps);
  writeFileSync(
    join(p.target.path, pagePath),
    original.replaceAll('promotion-amount', 'obsolete-amount'),
  );
  const run: Run = {
    id: randomUUID(),
    targetId: p.target.id,
    framework: 'playwright',
    selection: { kind: 'feature', value: featurePath },
    status: 'FAILED',
    createdAt: new Date().toISOString(),
    baseUrl: 'http://127.0.0.1:4311',
    idempotencyKey: randomUUID(),
    snapshot: p.workspace
      .features(p.target)
      .map(({ path, hash, scenarios }) => ({ path, hash, scenarios })),
    executableHash: p.workspace.fingerprint(p.target),
    artifacts: [],
    tests: [
      {
        nativeId: 'synthetic-unit-failure',
        name: 'Synthetic unit fixture, not native evidence',
        status: 'FAILED',
        durationMs: 1,
        featurePath,
        scenarioId: 'free-shipping',
        row: 1,
        error:
          "expect(locator).toHaveCount(1): getByTestId('obsolete-amount') resolved to 0 elements",
        steps: [],
      },
    ],
  };
  p.store.put('runs', run);
  return run;
}
async function proposal(p: ReturnType<typeof generationFixture>) {
  const run = failedFixture(p),
    d = await p.maintenance.diagnose(run.id);
  p.maintenance.review(d.id, {
    expectedHash: d.evidenceHash,
    classification: 'LOCATOR_DEFECT',
    rationale: 'Synthetic fixture changed only a test ID',
    observedEvidence:
      'Controlled fixture: current UI test ID is promotion-amount; expectations remain unchanged.',
  });
  return {
    run,
    d,
    r: p.maintenance.propose(d.id, {
      expectedHash: d.evidenceHash,
      path: pagePath,
      oldValue: 'obsolete-amount',
      newValue: 'promotion-amount',
      featurePath,
    }),
  };
}

test('Versioned failure cases preserve uncertainty and distinguish four symptom classes', () => {
  const cases = JSON.parse(readFileSync('docs/evaluations/fixtures/phase-5-v1.json', 'utf8')) as {
    cases: { text: string; expected: string }[];
  };
  for (const c of cases.cases)
    assert.ok(
      failureHypotheses([{ source: 'synthetic-case', text: c.text }]).some(
        (h) => h.classification === c.expected,
      ),
    );
  const mixed = failureHypotheses([
    { source: 'fixture', text: 'getByTestId: Expected text: 50 Received: 60' },
  ]);
  assert.ok(mixed.some((h) => h.classification === 'LOCATOR_DEFECT'));
  assert.ok(mixed.some((h) => h.classification === 'PRODUCT_REGRESSION'));
  assert.ok(mixed.every((h) => h.confidence === 'symptom'));
});

test('Literal repair changes only approved locator arguments and rejects arbitrary code/paths', () => {
  const broken = original.replaceAll('promotion-amount', 'obsolete-amount');
  const result = replaceLocator(pagePath, broken, 'obsolete-amount', 'promotion-amount');
  assert.equal(result.occurrences, 3);
  assert.equal(result.after.replaceAll('"promotion-amount"', "'promotion-amount'"), original);
  assert.throws(
    () => replaceLocator('ui/steps/promotions.ts', broken, 'obsolete-amount', 'new'),
    /existing Page/,
  );
  assert.throws(() => replaceLocator('../external.ts', broken, 'obsolete-amount', 'new'));
  assert.throws(() => replaceLocator(pagePath, broken, 'missing', 'new'), /No bounded/);
  assert.throws(
    () =>
      replaceLocator(
        pagePath,
        broken.replace("await expect(card.getByTestId('obsolete-amount')).toHaveCount(1);", ''),
        'obsolete-amount',
        'new',
      ),
    /same scope/,
  );
  assert.equal(
    replaceLocator(pagePath, original, 'Free shipping promotion', 'Observed shipping promotion')
      .occurrences,
    1,
  );
  const labelPage =
    "export class DemoPage { check() { const field = this.page.getByLabel('Old label'); expect(field).toHaveCount(1); expect(field).toBeVisible(); } }";
  assert.match(
    replaceLocator('ui/pages/DemoPage.ts', labelPage, 'Old label', 'New label').after,
    /New label/,
  );
  // Quotes remain a string literal, never an injected call or assertion removal.
  assert.match(replaceLocator(pagePath, broken, 'obsolete-amount', '"); evil(); //').after, /\\"/);
});

test('Diagnosis review, product non-repair, rejection and stale content preserve targets', async () => {
  const p = generationFixture();
  try {
    const run = failedFixture(p),
      before = targetRevision(p.target.path),
      d = await p.maintenance.diagnose(run.id);
    assert.equal(d.conclusion, 'UNKNOWN');
    assert.ok(d.evidence.some((e) => e.source.startsWith('test:')));
    const input = {
      expectedHash: d.evidenceHash,
      path: pagePath,
      oldValue: 'obsolete-amount',
      newValue: 'promotion-amount',
      featurePath,
    };
    assert.throws(() => p.maintenance.propose(d.id, input), /reviewed locator defect/);
    for (const classification of ['PRODUCT_REGRESSION', 'ENVIRONMENT', 'DATA'] as const) {
      p.maintenance.review(d.id, {
        expectedHash: d.evidenceHash,
        classification,
        rationale: 'Controlled fixture classification',
        observedEvidence: 'Explicit synthetic observation',
      });
      assert.throws(() => p.maintenance.propose(d.id, input), /reviewed locator defect/);
    }
    assert.equal(targetRevision(p.target.path), before);
    p.maintenance.review(d.id, {
      expectedHash: d.evidenceHash,
      classification: 'LOCATOR_DEFECT',
      rationale: 'Controlled obsolete locator',
      observedEvidence: 'Actual fixture test ID differs',
    });
    const r = p.maintenance.propose(d.id, input);
    assert.throws(() => p.maintenance.apply(r.id, r.hash), /Validate and approve/);
    assert.throws(
      () =>
        p.maintenance.validate(r.id, {
          expectedHash: r.hash,
          fingerprint: hash('fake'),
          trustExecution: false,
          baseUrl: run.baseUrl,
        }),
      /Explicit trust/,
    );
    p.maintenance.cancel(r.id, r.hash);
    assert.equal(p.maintenance.repair(r.id).status, 'REJECTED');
    assert.equal(targetRevision(p.target.path), before);
    writeFileSync(join(p.target.path, pagePath), original);
    assert.throws(() => p.maintenance.propose(d.id, input), /changed/);
  } finally {
    await p.app.close();
  }
});

test('Repair refuses stale bases, executable revisions, symlinks and tampered hashes', async () => {
  const p = generationFixture();
  try {
    const { r, d } = await proposal(p);
    assert.throws(() => p.maintenance.prepare(r.id, hash('other')), /exact repair/);
    assert.throws(
      () =>
        p.maintenance.review(d.id, {
          expectedHash: d.evidenceHash,
          classification: 'PRODUCT_REGRESSION',
          rationale: 'Change',
          observedEvidence: 'Change',
        }),
      /outstanding repair/,
    );
    const path = join(p.target.path, pagePath);
    unlinkSync(path);
    symlinkSync(join(p.source.path, 'Promotions.tsx'), path);
    assert.throws(() => p.maintenance.prepare(r.id, r.hash), /changed/);
  } finally {
    await p.app.close();
  }
});

test('Relationships reuse fixtures for step→Page, declare scenario→endpoint and invalidate edited sources', async () => {
  const p = generationFixture();
  try {
    failedFixture(p);
    const manifestPath = join(p.target.path, 'contracts/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.features[0].scenarios[0].bindings.karate.endpoint = {
      ref: { kind: 'source', id: p.source.id },
      path: 'Promotions.tsx',
      symbol: 'GET /promotions',
      hash: hash(readFileSync(join(p.source.path, 'Promotions.tsx'))),
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const graph = await relationships(p.generation.index, { kind: 'target', id: p.target.id });
    assert.ok(
      graph.edges.some(
        (e) =>
          e.kind === 'step-page' && e.from.includes('promotion shows') && e.to === 'PromotionsPage',
      ),
    );
    assert.ok(
      graph.edges.some(
        (e) =>
          e.kind === 'scenario-endpoint' &&
          e.from === 'free-shipping' &&
          e.to.includes('GET /promotions'),
      ),
    );
    const source = await relationships(p.generation.index, { kind: 'source', id: p.source.id });
    writeFileSync(join(p.source.path, 'Promotions.tsx'), 'export const changed = true;');
    const edited = await relationships(p.generation.index, { kind: 'source', id: p.source.id });
    assert.notEqual(source.treeHash, edited.treeHash);
    writeFileSync(join(p.target.path, pagePath), original);
    const next = await relationships(p.generation.index, { kind: 'target', id: p.target.id });
    assert.notEqual(graph.identity, next.identity);
    assert.equal(recentChanges(p.source.path, ['Promotions.tsx']).available, false);
  } finally {
    await p.app.close();
  }
});

test('Maintenance APIs enforce session, CSRF, bounded schemas and no caller-authored code', async () => {
  const p = generationFixture();
  try {
    assert.equal((await p.app.inject('/api/maintenance/state')).statusCode, 401);
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
    const state = await p.app.inject({ url: '/api/state', headers });
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/maintenance/runs/x/diagnose',
          headers,
          payload: {},
        })
      ).statusCode,
      403,
    );
    headers['x-qa-csrf'] = state.json().csrf;
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/maintenance/diagnoses/x/repair',
          headers,
          payload: {
            expectedHash: hash('x'),
            path: pagePath,
            oldValue: 'a',
            newValue: 'b',
            featurePath,
            after: 'arbitrary code',
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/intelligence/relationships',
          headers,
          payload: { kind: 'source', id: p.source.id, path: '/etc/passwd' },
        })
      ).statusCode,
      400,
    );
  } finally {
    await p.app.close();
  }
});

test('Source evidence invalidates review; Git history lookup remains read-only and bounded', async () => {
  const p = generationFixture();
  try {
    const manifestPath = join(p.target.path, 'contracts/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.features[0].scenarios[0].bindings.karate.endpoint = {
      ref: { kind: 'source', id: p.source.id },
      path: 'Promotions.tsx',
      symbol: 'GET /promotions',
      hash: hash(readFileSync(join(p.source.path, 'Promotions.tsx'))),
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const run = failedFixture(p),
      d = await p.maintenance.diagnose(run.id),
      before = targetRevision(p.target.path);
    assert.equal(d.sourceSnapshots.length, 1);
    writeFileSync(join(p.source.path, 'Promotions.tsx'), 'export const newContract = true;');
    assert.throws(
      () =>
        p.maintenance.review(d.id, {
          expectedHash: d.evidenceHash,
          classification: 'LOCATOR_DEFECT',
          rationale: 'Synthetic fixture',
          observedEvidence: 'Explicit controlled fixture observation',
        }),
      /changed/,
    );
    const changed = await relationships(p.generation.index, { kind: 'target', id: p.target.id });
    assert.equal(changed.edges.find((e) => e.kind === 'scenario-endpoint')?.endpointState, 'STALE');
    assert.notEqual(d.graphIdentity, changed.identity);
    assert.equal(targetRevision(p.target.path), before);
    // Read the existing platform history; never initialize or mutate a source Git repository.
    const changes = recentChanges(resolve('.'), ['README.md']);
    assert.equal(changes.available, true);
    assert.match(changes.revision!, /^[a-f0-9]{40,64}$/);
    assert.ok(changes.commits.length > 0 && changes.commits.length <= 5);
    assert.ok(changes.changedPaths.every((path) => path === 'README.md'));
  } finally {
    await p.app.close();
  }
});

test('Staged executable and canonical tampering cannot produce an authorized repair run', async () => {
  const p = generationFixture();
  try {
    const { r } = await proposal(p),
      before = targetRevision(p.target.path);
    // Empty dependency directory is a staging-only fixture; no process is executed here.
    mkdirSync(join(p.target.path, 'ui/node_modules'), { recursive: true });
    const prepared = p.maintenance.prepare(r.id, r.hash);
    const stage = join(p.maintenance.directory, 'staging', r.id);
    const canonical = join(stage, featurePath),
      saved = readFileSync(canonical, 'utf8');
    writeFileSync(canonical, saved.replace('50€', '99€'));
    assert.throws(() => p.maintenance.validationTarget(r.id), /canonical contract changed/);
    writeFileSync(canonical, saved);
    assert.equal(p.maintenance.validationTarget(r.id).trustFingerprint, prepared.fingerprint);
    const implementation = join(stage, pagePath);
    writeFileSync(implementation, readFileSync(implementation, 'utf8') + '\n// unrelated edit\n');
    assert.throws(() => p.maintenance.validationTarget(r.id), /executable changed/);
    assert.equal(targetRevision(p.target.path), before);
    assert.equal(
      p.store.list('runs').length,
      1,
      'Only the synthetic failed fixture exists; no validation was executed',
    );
  } finally {
    await p.app.close();
  }
});
