import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, type Target } from '../domain/model.ts';
import { hash } from '../domain/gherkin.ts';
import type { Store } from '../storage/store.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { ExecutionManager } from '../execution/manager.ts';
import type { CapabilityIndex } from '../intelligence/index.ts';
import { relationships, recentChanges } from '../intelligence/relationships.ts';
import { redact } from '../execution/reports.ts';
import { safeText } from '../recording/privacy.ts';
import { privateDirectory } from '../generation/private-directory.ts';
import {
  applyFiles,
  buildStage,
  currentText,
  makeDiff,
  targetRevision,
} from '../generation/staging.ts';
import { replaceLocator } from './locator.ts';
import type { Diagnosis, Classification, Repair } from './model.ts';

const clean = (text: string) => safeText(redact(text).slice(0, 8000));
const terminal = ['FAILED', 'INTERRUPTED'];
export function failureHypotheses(evidence: Diagnosis['evidence']): Diagnosis['hypotheses'] {
  const text = evidence.map((e) => e.text).join('\n');
  const result: Diagnosis['hypotheses'] = [];
  const add = (classification: Classification, reason: string) =>
    result.push({ classification, reason, confidence: 'symptom' });
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connection refused/i.test(text))
    add(
      'ENVIRONMENT',
      'Connection/DNS failure; check the authorized environment before changing tests.',
    );
  if (/locator|toHaveCount|getByRole|getByLabel|getByTestId|strict mode violation/i.test(text))
    add(
      'LOCATOR_DEFECT',
      'Locator/uniqueness symptom; a missing product element can produce the same symptom. Confirm the actual UI and business intent.',
    );
  if (/toHaveText|toEqual|toBe\(|match failed|assertion.*failed|expected.*received/is.test(text))
    add(
      'PRODUCT_REGRESSION',
      'Observed value differs from an expectation. Product regression, outdated expectation and bad data remain alternatives. Preserve the original assertion.',
    );
  if (
    /invalid.*(context|fixture|setup|test data)|context.*(expired|not found)|fixture.*not found|status code was: 4(?:00|04|22)|expected status: \d+, actual: 4(?:00|04|22)/i.test(
      text,
    )
  )
    add('DATA', 'Setup/context rejection; verify the actual precondition data and environment.');
  if (!result.length)
    add(
      'UNKNOWN',
      'Insufficient supported evidence for classification. Inspect native artifacts and relevant implementation.',
    );
  return result;
}
export class MaintenanceManager {
  readonly directory: string;
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
    readonly index: CapabilityIndex,
    readonly runner: ExecutionManager,
  ) {
    this.directory = join(store.directory, 'maintenance');
    privateDirectory(this.directory);
    privateDirectory(join(this.directory, 'staging'));
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS maintenance_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)',
    );
    for (const repair of this.list<Repair>('repair')) {
      const stage = join(this.directory, 'staging', repair.id);
      if (
        Date.now() - Date.parse(repair.createdAt) > store.settings().retentionDays * 86400000 &&
        existsSync(stage)
      ) {
        if (realpathSync(stage) !== stage)
          throw new AppError(403, 'Maintenance stage alias denied');
        rmSync(stage, { recursive: true });
        if (['STAGED', 'VALIDATING', 'VALIDATED'].includes(repair.status)) {
          repair.status = 'INVALIDATED';
          repair.error = 'Validation stage expired; inspect and propose again';
          this.put('repair', repair);
        }
      }
      for (const suffix of ['apply', 'rollback']) {
        const file = join(this.directory, repair.id + '.' + suffix + '.json');
        if (existsSync(file)) {
          const journal = JSON.parse(readFileSync(file, 'utf8'));
          if (
            (suffix === 'apply' && repair.status !== 'APPLIED') ||
            (suffix === 'rollback' && repair.rollback?.status !== 'APPLIED')
          ) {
            repair.status = 'APPLY_FAILED';
            repair.error = 'Recovery required: ' + suffix + ' journal ' + journal.state;
            this.put('repair', repair);
          }
        }
      }
    }
  }
  private put<T extends { id: string }>(kind: string, value: T): T {
    this.store.db
      .prepare(
        'INSERT INTO maintenance_records VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, kind, JSON.stringify(value));
    return value;
  }
  get<T>(kind: 'diagnosis' | 'repair', id: string): T {
    const row = this.store.db
      .prepare('SELECT data FROM maintenance_records WHERE id=? AND kind=?')
      .get(id, kind) as { data: string } | undefined;
    if (!row) throw new AppError(404, 'Maintenance record not found');
    return JSON.parse(row.data);
  }
  list<T>(kind: 'diagnosis' | 'repair'): T[] {
    return (
      this.store.db
        .prepare('SELECT data FROM maintenance_records WHERE kind=? ORDER BY rowid DESC LIMIT 100')
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  async diagnose(runId: string) {
    const run = this.store.get('runs', runId);
    if (!run || !terminal.includes(run.status) || run.proposalId)
      throw new AppError(422, 'Choose a completed failed target run, not a proposal run');
    const target = this.workspace.target(run.targetId);
    if (this.runner.busyTarget(target.id))
      throw new AppError(409, 'Wait for the target run to finish');
    const graph = await relationships(this.index, { kind: 'target', id: target.id });
    const snapshot = this.index.get({ kind: 'target', id: target.id })!;
    const files: Diagnosis['files'] = [];
    let bytes = 0;
    for (const file of snapshot.files
      .filter((f) => /^ui\/(pages|components|steps)\//.test(f.path))
      .slice(0, 12)) {
      try {
        const content = this.index.read(snapshot.ref, file.path);
        bytes += Buffer.byteLength(content.text);
        if (bytes > 64000) break;
        files.push({ path: file.path, hash: content.hash, text: content.text });
      } catch {
        /* Oversized indexed files require manual review. */
      }
    }
    const evidence: Diagnosis['evidence'] = [
      {
        source: 'run:' + run.id,
        text: clean(run.error || 'Native failed results below; run-level error unavailable.'),
      },
    ];
    for (const test of run.tests
      .filter((t) => ['FAILED', 'TIMED_OUT'].includes(t.status))
      .slice(0, 10)) {
      evidence.push({
        source: 'test:' + test.nativeId,
        text: clean(
          [
            test.name,
            test.error,
            ...test.steps
              .filter((s) => s.status === 'FAILED')
              .map((s) => s.name + ': ' + (s.error || '')),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      });
    }
    const revision = targetRevision(target.path);
    const diagnosis: Diagnosis = {
      id: randomUUID(),
      runId,
      targetId: target.id,
      createdAt: new Date().toISOString(),
      targetRevision: revision,
      executableCurrent: run.executableHash === this.workspace.fingerprint(target),
      evidenceHash: '',
      evidence,
      hypotheses: failureHypotheses(evidence),
      conclusion: 'UNKNOWN',
      files,
      graphIdentity: graph.identity,
      sourceSnapshots: graph.sources,
      relatedEdges: graph.edges,
      recentChanges: recentChanges(
        target.path,
        files.map((f) => f.path),
      ),
      limitations: [
        'Symptoms are hypotheses, not verified root causes. Human review must distinguish product intent from test defects.',
        'Implementation excerpts are current, not reconstructed historical code. An outdated executable requires a new failed run before a repair.',
        'No application or remote environment was probed. Validation is a separately authorized run.',
        'Static dependency edges are incomplete; shared Pages may affect additional features.',
      ],
    };
    diagnosis.evidenceHash = hash(
      JSON.stringify({ run, revision, files, graph: diagnosis.graphIdentity }),
    );
    return this.put('diagnosis', diagnosis);
  }
  review(
    id: string,
    input: {
      expectedHash: string;
      classification: Classification;
      rationale: string;
      observedEvidence: string;
    },
  ) {
    const d = this.get<Diagnosis>('diagnosis', id);
    if (d.evidenceHash !== input.expectedHash)
      throw new AppError(409, 'Review the current evidence');
    this.freshDiagnosis(d);
    if (
      !['LOCATOR_DEFECT', 'PRODUCT_REGRESSION', 'ENVIRONMENT', 'DATA', 'UNKNOWN'].includes(
        input.classification,
      ) ||
      !input.rationale.trim() ||
      !input.observedEvidence.trim()
    )
      throw new AppError(400, 'Classification requires rationale and explicitly observed evidence');
    if (
      this.list<Repair>('repair').some(
        (r) => r.diagnosisId === id && !['REJECTED', 'APPLIED', 'INVALIDATED'].includes(r.status),
      )
    )
      throw new AppError(409, 'Reject the outstanding repair before changing its diagnosis');
    d.conclusion = input.classification;
    d.rationale = clean(input.rationale);
    d.review = {
      at: new Date().toISOString(),
      reviewer: 'local-user',
      observedEvidence: clean(input.observedEvidence),
    };
    return this.put('diagnosis', d);
  }
  private freshDiagnosis(d: Diagnosis) {
    const target = this.workspace.target(d.targetId);
    if (
      targetRevision(target.path) !== d.targetRevision ||
      recentChanges(target.path, []).revision !== d.recentChanges.revision
    )
      throw new AppError(409, 'Target content or Git revision changed; diagnose again');
    for (const source of d.sourceSnapshots) {
      const root = this.index.root(source.ref);
      if (
        this.index.read(source.ref, source.path).hash !== source.hash ||
        recentChanges(root.path, []).revision !== source.revision
      )
        throw new AppError(409, 'Source evidence changed; diagnose again');
    }
    return target;
  }
  propose(
    id: string,
    input: {
      expectedHash: string;
      path: string;
      oldValue: string;
      newValue: string;
      featurePath: string;
    },
  ) {
    const d = this.get<Diagnosis>('diagnosis', id),
      target = this.freshDiagnosis(d);
    if (
      input.expectedHash !== d.evidenceHash ||
      d.conclusion !== 'LOCATOR_DEFECT' ||
      !d.review ||
      !d.executableCurrent
    )
      throw new AppError(
        403,
        'A reviewed locator defect against the current executable is required',
      );
    if (this.runner.busyTarget(target.id)) throw new AppError(409, 'Target is running');
    const failed = this.store.get('runs', d.runId)!;
    const feature = failed.snapshot.find((f) => f.path === input.featurePath);
    if (
      !feature ||
      !failed.tests.some(
        (t) =>
          ['FAILED', 'TIMED_OUT'].includes(t.status) &&
          t.featurePath === feature.path &&
          t.scenarioId &&
          feature.scenarios.some((s) => s.id === t.scenarioId),
      )
    )
      throw new AppError(422, 'Select a canonical feature linked to an actual failed scenario');
    const current = this.workspace.features(target).find((f) => f.path === feature.path);
    if (!current || current.hash !== feature.hash)
      throw new AppError(409, 'Canonical contract changed since the failed run');
    const source = d.files.find((f) => f.path === input.path);
    if (!source || currentText(target.path, source.path) !== source.text)
      throw new AppError(409, 'Inspect the current Page/component first');
    const result = replaceLocator(source.path, source.text, input.oldValue, input.newValue);
    const files = [
      { path: source.path, before: source.text, baseHash: source.hash, after: result.after },
    ];
    const repair: Repair = {
      id: 'repair-' + randomUUID(),
      diagnosisId: id,
      originalRunId: d.runId,
      featurePath: feature.path,
      contractHash: feature.hash,
      targetId: target.id,
      framework: 'playwright',
      targetRevision: d.targetRevision,
      evidenceHash: d.evidenceHash,
      plan: {
        summary: `Replace ${result.occurrences} literal locator occurrence(s); preserve all other source and assertions. Reviewer: ${d.rationale}`,
        reuse: [{ path: source.path, symbol: 'existing Page/component' }],
        files: [source.path],
      },
      files,
      diff: makeDiff(files),
      hash: '',
      status: 'STAGED',
      createdAt: new Date().toISOString(),
    };
    if (failed.framework !== 'playwright')
      throw new AppError(422, 'Literal locator repair supports Playwright failures only');
    repair.hash = this.digest(repair);
    return this.put('repair', repair);
  }
  private digest(r: Repair) {
    return hash(
      JSON.stringify({
        diagnosisId: r.diagnosisId,
        evidenceHash: r.evidenceHash,
        run: r.originalRunId,
        target: r.targetId,
        revision: r.targetRevision,
        feature: r.featurePath,
        contractHash: r.contractHash,
        files: r.files,
        diff: r.diff,
      }),
    );
  }
  repair(id: string) {
    const r = this.get<Repair>('repair', id);
    if (r.status === 'VALIDATING') {
      const run = this.store.get('runs', r.validationRunId!);
      if (run && ['PASSED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status)) {
        r.status = run.status === 'PASSED' ? 'VALIDATED' : 'STAGED';
        r.error =
          run.status === 'PASSED'
            ? undefined
            : 'Validation ' + run.status + '; inspect native evidence';
        this.put('repair', r);
      }
    }
    return r;
  }
  private fresh(r: Repair, expectedHash = r.hash) {
    if (r.hash !== expectedHash || this.digest(r) !== r.hash)
      throw new AppError(409, 'Review this exact repair diff');
    const d = this.get<Diagnosis>('diagnosis', r.diagnosisId);
    if (d.conclusion !== 'LOCATOR_DEFECT' || !d.review || d.evidenceHash !== r.evidenceHash)
      throw new AppError(409, 'Diagnosis approval changed');
    const target = this.freshDiagnosis(d);
    const feature = this.workspace.features(target).find((f) => f.path === r.featurePath);
    if (feature?.hash !== r.contractHash) throw new AppError(409, 'Contract changed');
    return { target, feature };
  }
  prepare(id: string, expectedHash: string) {
    const r = this.repair(id),
      { target } = this.fresh(r, expectedHash);
    if (r.status !== 'STAGED' || this.runner.busyTarget(r.targetId))
      throw new AppError(409, 'Repair must be staged and target idle');
    const root = join(this.directory, 'staging', r.id);
    if (existsSync(root)) {
      if (realpathSync(root) !== root) throw new AppError(403, 'Stage symlink denied');
      rmSync(root, { recursive: true });
    }
    buildStage(target, r, root);
    r.validationFingerprint = this.workspace.fingerprint({ ...target, path: root });
    this.put('repair', r);
    return {
      fingerprint: r.validationFingerprint,
      diffHash: r.hash,
      warning:
        'Executes reviewed code with host privileges. Review the exact diff and environment. This is not a sandbox.',
    };
  }
  validationTarget(id: string): Target {
    const r = this.repair(id),
      { target } = this.fresh(r);
    if (!['STAGED', 'VALIDATING', 'VALIDATED'].includes(r.status) || !r.validationFingerprint)
      throw new AppError(403, 'Prepare the repair stage first');
    const root = join(this.directory, 'staging', id);
    if (realpathSync(root) !== root) throw new AppError(403, 'Stage root changed');
    const staged = { ...target, path: root, trustFingerprint: r.validationFingerprint };
    if (this.workspace.fingerprint(staged) !== r.validationFingerprint)
      throw new AppError(409, 'Staged executable changed');
    const canonical = this.workspace.features(target);
    const stagedContracts = this.workspace.features(staged);
    if (
      canonical.length !== stagedContracts.length ||
      canonical.some((f) => !stagedContracts.some((s) => s.path === f.path && s.hash === f.hash))
    )
      throw new AppError(409, 'Staged canonical contract changed; prepare validation again');
    return staged;
  }
  validate(
    id: string,
    input: { expectedHash: string; fingerprint: string; trustExecution: boolean; baseUrl: string },
  ) {
    const r = this.repair(id);
    this.fresh(r, input.expectedHash);
    if (
      r.status !== 'STAGED' ||
      !input.trustExecution ||
      input.fingerprint !== r.validationFingerprint
    )
      throw new AppError(403, 'Explicit trust of the exact staged repair is required');
    if (this.runner.busyTarget(r.targetId)) throw new AppError(409, 'Target is running');
    const target = this.validationTarget(id);
    const run = this.runner.create(
      {
        targetId: r.targetId,
        framework: 'playwright',
        selection: { kind: 'feature', value: r.featurePath },
        baseUrl: input.baseUrl,
        idempotencyKey: randomUUID(),
      },
      { proposalId: id, target },
    );
    r.validationRunId = run.id;
    r.status = 'VALIDATING';
    this.put('repair', r);
    return run;
  }
  cancel(id: string, expectedHash: string) {
    const r = this.repair(id);
    if (r.hash !== expectedHash || ['APPLIED', 'APPLY_FAILED'].includes(r.status))
      throw new AppError(409, 'Repair cannot be cancelled');
    if (r.status === 'VALIDATING') {
      this.runner.cancel(r.validationRunId!);
      return this.repair(id);
    }
    r.status = 'REJECTED';
    return this.put('repair', r);
  }
  apply(id: string, expectedHash: string) {
    const r = this.repair(id),
      { target, feature } = this.fresh(r, expectedHash);
    if (r.status !== 'VALIDATED' || this.runner.busyTarget(r.targetId))
      throw new AppError(403, 'Validate and approve the exact repair before application');
    const run = this.store.get('runs', r.validationRunId!);
    const expected = feature.scenarios
      .flatMap((s) => Array(s.examples.length || 1).fill(s.id) as string[])
      .sort();
    if (
      !run ||
      run.status !== 'PASSED' ||
      run.proposalId !== r.id ||
      run.framework !== 'playwright' ||
      run.executableHash !== r.validationFingerprint ||
      run.tests.some((t) => t.status !== 'PASSED') ||
      JSON.stringify(run.tests.map((t) => t.scenarioId).sort()) !== JSON.stringify(expected)
    )
      throw new AppError(409, 'Complete linked native evidence for every example row is required');
    this.validationTarget(id);
    r.approval = { hash: r.hash, at: new Date().toISOString(), reviewer: 'local-user' };
    try {
      applyFiles(target.path, r, join(this.directory, id + '.apply.json'));
      r.status = 'APPLIED';
      r.appliedAt = new Date().toISOString();
    } catch (e) {
      r.status = 'APPLY_FAILED';
      r.error = 'Apply failed; inspect recovery journal';
      this.put('repair', r);
      throw e;
    }
    return this.put('repair', r);
  }
  prepareRollback(id: string, expectedHash: string) {
    const r = this.repair(id);
    if (
      r.hash !== expectedHash ||
      this.digest(r) !== r.hash ||
      r.status !== 'APPLIED' ||
      r.rollback?.status === 'APPLIED'
    )
      throw new AppError(409, 'Choose the applied repair');
    const target = this.workspace.target(r.targetId);
    for (const f of r.files)
      if (currentText(target.path, f.path) !== f.after)
        throw new AppError(409, 'Concurrent edit; reversal refused');
    const files = r.files.map((f) => ({
      path: f.path,
      before: f.after,
      after: f.before!,
      baseHash: hash(f.after),
    }));
    const diff = makeDiff(files);
    r.rollback = {
      hash: hash(JSON.stringify({ repair: r.hash, diff, revision: targetRevision(target.path) })),
      diff,
      status: 'PROPOSED',
    };
    return this.put('repair', r);
  }
  rollback(id: string, expectedHash: string) {
    const r = this.repair(id),
      target = this.workspace.target(r.targetId);
    if (
      r.status !== 'APPLIED' ||
      r.rollback?.status !== 'PROPOSED' ||
      expectedHash !== r.rollback.hash ||
      this.runner.busyTarget(target.id)
    )
      throw new AppError(403, 'Review and approve the exact reversal diff while target is idle');
    const files = r.files.map((f) => ({
      path: f.path,
      before: f.after,
      after: f.before!,
      baseHash: hash(f.after),
    }));
    const diff = makeDiff(files);
    if (
      hash(JSON.stringify({ repair: r.hash, diff, revision: targetRevision(target.path) })) !==
        expectedHash ||
      diff !== r.rollback.diff
    )
      throw new AppError(409, 'Target changed since reversal review');
    try {
      applyFiles(
        target.path,
        { ...r, hash: expectedHash, files, diff },
        join(this.directory, id + '.rollback.json'),
      );
    } catch (e) {
      r.status = 'APPLY_FAILED';
      r.error = 'Rollback failed; inspect recovery journal';
      this.put('repair', r);
      throw e;
    }
    r.rollback.status = 'APPLIED';
    r.rollback.at = new Date().toISOString();
    return this.put('repair', r);
  }
}
