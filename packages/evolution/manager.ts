import { randomUUID } from 'node:crypto';
import type { Store } from '../storage/store.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { CapabilityIndex } from '../intelligence/index.ts';
import type { GenerationRepository } from '../generation/repository.ts';
import type { MaintenanceManager } from '../maintenance/manager.ts';
import { AppError } from '../domain/model.ts';
import { EvolutionRepository } from './repository.ts';
import { KnowledgeManager } from './knowledge.ts';
import { SkillManager } from './skills.ts';
import { HealthManager } from '../health/manager.ts';
import { workflowMetrics } from './metrics.ts';
export interface EvolutionJob {
  id: string;
  kind: 'COLLECT' | 'EVALUATE' | 'SUMMARIZE';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'INTERRUPTED';
  createdAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
}
export class EvolutionManager {
  readonly repository: EvolutionRepository;
  readonly knowledge: KnowledgeManager;
  readonly skills: SkillManager;
  readonly health: HealthManager;
  private automatic = new Set<string>();
  private autoTimer?: ReturnType<typeof setTimeout>;
  private closing = false;
  private active?: { id: string; abort: AbortController; done: Promise<void> };
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
    readonly index: CapabilityIndex,
    readonly generation: GenerationRepository,
    readonly maintenance: MaintenanceManager,
  ) {
    this.repository = new EvolutionRepository(store);
    this.repository.interruptActivities();
    this.knowledge = new KnowledgeManager(
      this.repository,
      workspace,
      index,
      () => generation.list('tasks'),
      () => maintenance.list('repair'),
    );
    this.skills = new SkillManager(this.repository, workspace);
    this.health = new HealthManager(this.repository, workspace, index, this.knowledge, this.skills);
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS evolution_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
    );
    for (const job of this.jobs())
      if (['RUNNING', 'CANCEL_REQUESTED'].includes(job.status)) {
        job.status = 'INTERRUPTED';
        job.finishedAt = new Date().toISOString();
        job.error = 'Service restarted; no automatic evaluation/collection rerun';
        this.put(job);
      }
  }
  queueCollection(targetId: string) {
    if (this.closing || this.automatic.size >= 20) return;
    this.automatic.add(targetId);
    if (this.autoTimer) return;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = undefined;
      this.drainAutomatic();
    }, 750);
    this.autoTimer.unref();
  }
  private drainAutomatic() {
    if (this.closing || this.active || !this.automatic.size) return;
    const targetId = [...this.automatic][0];
    this.automatic.delete(targetId);
    try {
      this.collect(targetId);
    } catch {
      /* Removed/unavailable target remains unavailable, never changed. */
    }
  }
  jobs() {
    return (
      this.store.db
        .prepare('SELECT data FROM evolution_jobs ORDER BY rowid DESC LIMIT 100')
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as EvolutionJob);
  }
  job(id: string) {
    const row = this.store.db.prepare('SELECT data FROM evolution_jobs WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new AppError(404, 'Evolution job unavailable');
    return JSON.parse(row.data) as EvolutionJob;
  }
  private put(job: EvolutionJob) {
    this.store.db
      .prepare(
        'INSERT INTO evolution_jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(job.id, JSON.stringify(job));
    return job;
  }
  start(kind: EvolutionJob['kind'], work: (signal: AbortSignal) => Promise<unknown>) {
    if (this.closing || this.active)
      throw new AppError(409, 'Cancel or wait for the active knowledge/evaluation job');
    const job: EvolutionJob = {
      id: randomUUID(),
      kind,
      status: 'RUNNING',
      createdAt: new Date().toISOString(),
    };
    this.put(job);
    const abort = new AbortController();
    const done = Promise.resolve().then(async () => {
      try {
        const result = await work(abort.signal);
        if (abort.signal.aborted) throw new Error('Cancelled');
        job.result = result;
        job.status = 'SUCCEEDED';
      } catch (error) {
        job.status = abort.signal.aborted ? 'CANCELLED' : 'FAILED';
        job.error =
          error instanceof AppError
            ? error.message
            : 'Operation failed; inspect supported inputs, permissions and evaluator prerequisites.';
      } finally {
        job.finishedAt = new Date().toISOString();
        this.put(job);
        if (this.active?.id === job.id) this.active = undefined;
        if (!this.closing && this.automatic.size) this.queueCollection([...this.automatic][0]);
      }
    });
    this.active = { id: job.id, abort, done };
    return job;
  }
  cancel(id: string) {
    const job = this.job(id);
    if (this.active?.id === id) {
      job.status = 'CANCEL_REQUESTED';
      this.put(job);
      this.active.abort.abort();
    }
    return job;
  }
  collect(targetId: string) {
    this.workspace.target(targetId);
    return this.start('COLLECT', (signal) => this.knowledge.collect(targetId, signal));
  }
  evaluate(
    bundleId: string,
    input: { expectedHash: string; baselineId?: string; trustExecution: boolean },
  ) {
    return this.start('EVALUATE', (signal) => this.skills.evaluate(bundleId, input, signal));
  }
  improvement(targetId: string, parentId: string) {
    const runs = this.health.repository
      .runs()
      .filter((r) => r.targetId === targetId && r.status === 'SUCCEEDED');
    const repeated = runs.filter((r) =>
      r.findings.some((f) =>
        runs.some(
          (other) =>
            other.id !== r.id && other.findings.some((o) => o.fingerprint === f.fingerprint),
        ),
      ),
    );
    if (repeated.length < 2)
      throw new AppError(
        409,
        'Run real read-only health checks twice and inspect repeated findings before proposing this improvement',
      );
    return this.skills.improvement(
      targetId,
      parentId,
      repeated.slice(0, 8).map((r) => 'health:' + r.id),
    );
  }
  summarize(input: {
    targetId: string;
    expectedHash: string;
    healthRunIds: string[];
    trustExecution: boolean;
  }) {
    const active = this.repository
      .list('active')
      .find((a) => a.targetId === input.targetId && a.name === 'summarize-health-findings');
    if (!input.trustExecution || !active || active.hash !== input.expectedHash)
      throw new AppError(403, 'Trust the exact active summary bundle for this invocation');
    this.skills.verifyActive(input.targetId, active.name);
    const runs = input.healthRunIds.map((id) => this.health.repository.run(id));
    if (
      !runs.length ||
      runs.length > 4 ||
      new Set(input.healthRunIds).size !== runs.length ||
      runs.some((r) => r.targetId !== input.targetId || r.status !== 'SUCCEEDED')
    )
      throw new AppError(422, 'Select at most four complete health runs from this target');
    const findings = runs
      .flatMap((r) =>
        r.findings.map((f) => ({
          root: f.root,
          fingerprint: f.fingerprint,
          severity: f.severity,
          evidence: f.evidence,
        })),
      )
      .slice(0, 100);
    return this.start('SUMMARIZE', (signal) =>
      this.skills.invokeSummary(
        active.bundleId,
        findings,
        runs.map((r) => r.id),
        signal,
      ),
    );
  }
  metrics() {
    return workflowMetrics(this.repository, this.generation, this.maintenance);
  }
  async shutdown() {
    this.closing = true;
    clearTimeout(this.autoTimer);
    this.automatic.clear();
    await this.health.shutdown();
    if (this.active) {
      this.active.abort.abort();
      await this.active.done;
    }
  }
}
