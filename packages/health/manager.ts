import { randomUUID } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  accessSync,
  constants,
  realpathSync,
  lstatSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { AppError } from '../domain/model.ts';
import { hash } from '../domain/gherkin.ts';
import { readText, fileTree, within } from '../workspace/files.ts';
import { targetRevision } from '../generation/staging.ts';
import type { EvolutionRepository } from '../evolution/repository.ts';
import type { KnowledgeManager } from '../evolution/knowledge.ts';
import type { SkillManager } from '../evolution/skills.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { CapabilityIndex, RootRef, RepositoryIndex } from '../intelligence/index.ts';
import { HealthRepository } from './repository.ts';
import type { HealthRun, Finding } from './model.ts';
import { finding, inspectAutomation, inspectInstructions } from './inspect.ts';
const exec = promisify(execFile);
const now = () => new Date().toISOString();
export class HealthManager {
  readonly repository: HealthRepository;
  platformStatus?: () => { apiListening: boolean; frontendBuilt: boolean };
  private active?: { id: string; abort: AbortController; done: Promise<void> };
  private timer?: ReturnType<typeof setInterval>;
  private closing = false;
  constructor(
    readonly evolution: EvolutionRepository,
    readonly workspace: Workspace,
    readonly index: CapabilityIndex,
    readonly knowledge: KnowledgeManager,
    readonly skills: SkillManager,
  ) {
    this.repository = new HealthRepository(evolution.store);
    for (const run of this.repository.runs())
      if (['RUNNING', 'CANCEL_REQUESTED'].includes(run.status)) {
        run.status = 'INTERRUPTED';
        run.finishedAt = now();
        run.error = 'Service restarted; no automatic replay of an incomplete check';
        this.repository.put(run);
      }
    for (const schedule of this.repository.schedules())
      if (schedule.enabled && schedule.nextAt && Date.parse(schedule.nextAt) < Date.now()) {
        schedule.missed +=
          Math.floor(
            (Date.now() - Date.parse(schedule.nextAt)) / (schedule.intervalMinutes * 60000),
          ) + 1;
        schedule.nextAt = new Date(Date.now() + schedule.intervalMinutes * 60000).toISOString();
        this.repository.schedule(schedule);
      }
  }
  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => {
        /* Individual schedule errors are retained below. */
      });
    }, 1000);
    this.timer.unref();
  }
  schedule(input: {
    targetId?: string;
    enabled: boolean;
    intervalMinutes: number;
    slowSetupMs: number;
  }) {
    if (input.targetId) this.workspace.target(input.targetId);
    if (
      !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 1 ||
      input.intervalMinutes > 1440 ||
      !Number.isInteger(input.slowSetupMs) ||
      input.slowSetupMs < 100 ||
      input.slowSetupMs > 120000
    )
      throw new AppError(400, 'Schedule interval/slow setup threshold outside supported range');
    const id = input.targetId || 'platform',
      prior = this.repository.schedules().find((s) => s.id === id);
    if (!prior && this.repository.schedules().length >= 20)
      throw new AppError(413, 'At most twenty local health schedules');
    return this.repository.schedule({
      ...input,
      id,
      nextAt: input.enabled
        ? new Date(Date.now() + input.intervalMinutes * 60000).toISOString()
        : null,
      lastRunId: prior?.lastRunId || null,
      missed: prior?.missed || 0,
      skippedOverlap: prior?.skippedOverlap || 0,
    });
  }
  async tick(time = Date.now()) {
    if (this.closing) return;
    for (const schedule of this.repository
      .schedules()
      .filter((s) => s.enabled && s.nextAt && Date.parse(s.nextAt) <= time)) {
      schedule.nextAt = new Date(time + schedule.intervalMinutes * 60000).toISOString();
      if (this.active) schedule.skippedOverlap++;
      else {
        try {
          schedule.lastRunId = this.start(schedule.targetId, 'SCHEDULED', schedule.slowSetupMs).id;
          schedule.lastError = undefined;
        } catch {
          schedule.lastError =
            'Scheduled check could not start; verify the registered target and permissions.';
        }
      }
      this.repository.schedule(schedule);
    }
  }
  start(targetId?: string, origin: HealthRun['origin'] = 'MANUAL', slowSetupMs = 2000) {
    if (this.closing || this.active)
      throw new AppError(409, 'One health check runs at a time; cancel or wait for it');
    if (targetId) this.workspace.target(targetId);
    const run: HealthRun = {
      id: randomUUID(),
      targetId,
      origin,
      status: 'RUNNING',
      createdAt: now(),
      checks: [],
      findings: [],
    };
    this.repository.put(run);
    const abort = new AbortController();
    const done = Promise.resolve()
      .then(() => this.inspect(run, slowSetupMs, abort.signal))
      .finally(() => {
        if (this.active?.id === run.id) this.active = undefined;
      });
    this.active = { id: run.id, abort, done };
    return run;
  }
  cancel(id: string) {
    const run = this.repository.run(id);
    if (this.active?.id === id) {
      run.status = 'CANCEL_REQUESTED';
      this.repository.put(run);
      this.active.abort.abort();
    }
    return run;
  }
  private async inspect(run: HealthRun, slowSetupMs: number, signal: AbortSignal) {
    const root = run.targetId ? 'target:' + run.targetId : 'platform';
    const add = (f: Finding) => {
      const existing = run.findings.find((x) => x.fingerprint === f.fingerprint);
      if (existing)
        existing.evidence = [...new Set([...existing.evidence, ...f.evidence])].slice(0, 12);
      else if (run.findings.length < 500) run.findings.push(f);
    };
    const check = async (name: string, work: () => void | Promise<void>) => {
      if (signal.aborted) throw new AppError(409, 'Cancelled health check');
      const before = run.findings.length;
      try {
        await work();
        run.checks.push({
          name,
          status: run.findings.length > before ? 'FINDINGS' : 'PASSED',
          detail: 'Read-only supported checks completed; heuristic limits accompany findings.',
        });
      } catch (e) {
        if (signal.aborted) throw e;
        run.checks.push({
          name,
          status: 'UNAVAILABLE',
          detail:
            'Check incomplete; verify configuration, root permissions and supported file budgets.',
        });
        add(
          finding(
            'CHECK_UNAVAILABLE',
            root,
            'WARNING',
            [name, 'No passing claim is made for this check.'],
            'Resolve prerequisites and rerun the bounded check.',
            name,
          ),
        );
      }
      this.repository.put(run);
      await setImmediate();
    };
    try {
      await check('Platform and dependencies', async () => {
        accessSync(this.evolution.store.directory, constants.R_OK | constants.W_OK);
        const platform = this.platformStatus?.();
        if (platform && !platform.apiListening)
          run.checks.push({
            name: 'Backend availability',
            status: 'UNAVAILABLE',
            detail:
              'No listening HTTP server observed; inject/unit mode is not a production startup proof.',
          });
        if (platform && !platform.frontendBuilt)
          add(
            finding(
              'FRONTEND_BUILD_MISSING',
              'platform',
              'WARNING',
              ['Production frontend index is absent.'],
              'Build the pinned frontend before normal local startup.',
            ),
          );
        if (!/^v24\./.test(process.version))
          add(
            finding(
              'NODE_VERSION',
              'platform',
              'ERROR',
              ['Running Node differs from the pinned Node 24 line.'],
              'Use the pinned supported Node runtime.',
            ),
          );
        if (this.evolution.store.integrity() !== 'ok')
          add(
            finding(
              'DATABASE_INTEGRITY',
              'platform',
              'ERROR',
              ['SQLite integrity_check did not return ok'],
              'Back up private state and investigate database integrity.',
            ),
          );
        if (!existsSync(chromium.executablePath()))
          add(
            finding(
              'BROWSER_MISSING',
              'platform',
              'ERROR',
              ['Pinned Chromium installation unavailable'],
              'Install the pinned Playwright Chromium explicitly.',
            ),
          );
        try {
          const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java';
          const result = await exec(java, ['-version'], {
            timeout: 3000,
            maxBuffer: 16000,
            signal,
            env: { PATH: process.env.PATH, JAVA_HOME: process.env.JAVA_HOME },
          });
          if (!/version "21\./.test(result.stderr + result.stdout))
            add(
              finding(
                'JAVA_VERSION',
                'platform',
                'ERROR',
                ['Configured Java is not the supported Java 21 runtime.'],
                'Select the pinned Java 21 installation.',
              ),
            );
        } catch (e) {
          if (signal.aborted) throw e;
          add(
            finding(
              'JAVA_UNAVAILABLE',
              'platform',
              'ERROR',
              ['Fixed java -version check failed or timed out.'],
              'Configure the pinned Java 21 runtime explicitly.',
            ),
          );
        }
        run.checks.push({
          name: 'AI connectivity',
          status: 'UNAVAILABLE',
          detail:
            'Not probed automatically; use the explicit configured-provider connection action. No inference or credential reuse occurs.',
        });
      });
      if (run.targetId) {
        const target = this.workspace.target(run.targetId),
          initial = targetRevision(target.path);
        await check('Workspace permissions and runner configuration', () => {
          accessSync(target.path, constants.R_OK);
          try {
            accessSync(target.path, constants.W_OK);
          } catch {
            add(
              finding(
                'TARGET_READ_ONLY',
                root,
                'WARNING',
                ['Registered target lacks OS write access.'],
                'Review permissions before any separately approved save or application.',
              ),
            );
          }
          for (const path of ['ui/package.json', 'contracts/manifest.json']) {
            try {
              const parsed = JSON.parse(readText(target.path, path).text);
              if (
                path.endsWith('manifest.json') &&
                (parsed.schemaVersion !== 1 || !Array.isArray(parsed.features))
              )
                throw new Error('Invalid manifest');
            } catch {
              add(
                finding(
                  'INVALID_JSON_CONFIG',
                  root,
                  'ERROR',
                  [path, 'Missing or invalid supported JSON configuration'],
                  'Correct configuration manually, then review executable trust.',
                  path,
                ),
              );
            }
          }
          for (const path of [
            'api/gradlew',
            'api/gradle/wrapper/gradle-wrapper.jar',
            'ui/node_modules/@playwright/test/package.json',
          ]) {
            const absolute = join(target.path, path);
            if (!existsSync(absolute) || !within(target.path, realpathSync(absolute)))
              add(
                finding(
                  'DEPENDENCY_MISSING',
                  root,
                  'ERROR',
                  [path, 'Required dependency is absent or resolves outside the target.'],
                  'Install or review the pinned dependency explicitly; checks never install dependencies.',
                  path,
                ),
              );
          }
          if (target.trustFingerprint !== this.workspace.fingerprint(target))
            add(
              finding(
                'EXECUTION_TRUST_STALE',
                root,
                'WARNING',
                ['Executable project fingerprint is not currently trusted.'],
                'Inspect the current configuration and explicitly trust before native execution.',
              ),
            );
        });
        await check('Automation syntax, reuse and execution evidence', () => {
          let index: RepositoryIndex | undefined;
          try {
            index = this.index.get({ kind: 'target', id: target.id });
          } catch {
            /* Report as stale/missing below. */
          }
          const paths = fileTree(target.path)
            .filter(
              (p) =>
                /\.(feature|tsx?|js)$/.test(p) &&
                /^(contracts\/features\/|ui\/|api\/src\/test\/resources\/karate-config)/.test(p),
            )
            .slice(0, 150);
          let bytes = 0;
          const files: { path: string; text: string }[] = [];
          for (const path of paths) {
            if (signal.aborted) throw new AppError(409, 'Cancelled');
            const text = readText(target.path, path).text;
            bytes += Buffer.byteLength(text);
            if (bytes > 1000000) throw new AppError(413, 'Health excerpt budget exceeded');
            files.push({ path, text });
          }
          const runs = this.evolution.store
            .list('runs')
            .filter((r) => r.targetId === target.id && !r.proposalId);
          inspectAutomation(root, files, index, runs, slowSetupMs).forEach(add);
          if (!index)
            add(
              finding(
                'INDEX_MISSING',
                root,
                'WARNING',
                ['No current authorized target index.'],
                'Explicitly refresh the target index.',
              ),
            );
          else {
            const filesCurrent = index.files.every((f) => {
              try {
                return readText(target.path, f.path).hash === f.hash;
              } catch {
                return false;
              }
            });
            const eligiblePaths = paths.filter((p) => !/config\.[jt]s$/.test(p));
            if (!filesCurrent || eligiblePaths.some((p) => !index!.files.some((f) => f.path === p)))
              add(
                finding(
                  'INDEX_STALE',
                  root,
                  'WARNING',
                  [
                    'Indexed content differs, a supported new file is absent, or an indexed file was removed.',
                  ],
                  'Explicitly refresh the bounded index before using its facts.',
                ),
              );
          }
          for (const native of runs.slice(-50)) {
            if (native.artifactsExpired) continue;
            for (const artifact of native.artifacts.slice(0, 100)) {
              const directory = join(this.evolution.store.directory, 'runs', native.id),
                file = join(directory, artifact.name);
              let present = false;
              try {
                present =
                  within(directory, file) &&
                  realpathSync(file) === file &&
                  lstatSync(file).isFile() &&
                  statSync(file).size === artifact.size;
              } catch {
                /* Missing artifact is evidence, not passing. */
              }
              if (!present)
                add(
                  finding(
                    'ARTIFACT_MISSING',
                    root,
                    'WARNING',
                    [
                      'run:' + native.id,
                      artifact.name,
                      'Artifact absent, aliased or size differs; expected retention expiry is excluded.',
                    ],
                    'Inspect retention/storage and retain native evidence for diagnosis.',
                    native.id + ':' + artifact.name,
                  ),
                );
            }
          }
        });
        await check('Knowledge and skill health', () => {
          for (const k of this.knowledge.records(target.id)) {
            if (k.status === 'STALE')
              add(
                finding(
                  'KNOWLEDGE_STALE',
                  root,
                  'WARNING',
                  [
                    'knowledge:' + k.id,
                    'Source content/policy no longer matches the recorded version.',
                  ],
                  'Revalidate the relevant source and review a replacement.',
                  k.id,
                ),
              );
            if (k.documentHash) {
              const doc = this.knowledge.document(k.id);
              if (!doc.fresh)
                add(
                  finding(
                    'DOCUMENT_STALE',
                    root,
                    'WARNING',
                    [
                      'knowledge:' + k.id,
                      'Published private document refers to outdated evidence.',
                    ],
                    'Review the current sourced revision before publishing a replacement.',
                    k.id,
                  ),
                );
            }
          }
          const registeredRefs = [
            ...this.evolution.store.list('sources').map((s) => 'source:' + s.id),
            ...this.evolution.store.list('targets').map((t) => 'target:' + t.id),
          ];
          const bundles = this.evolution.list('bundle'),
            active = this.evolution.list('active').filter((a) => a.targetId === target.id);
          for (const bundle of bundles) {
            if (
              bundles.some(
                (other) =>
                  other.id !== bundle.id &&
                  other.name === bundle.name &&
                  JSON.stringify(other.files) === JSON.stringify(bundle.files),
              )
            )
              add(
                finding(
                  'DUPLICATE_SKILL_CANDIDATE',
                  root,
                  'INFO',
                  [
                    bundle.name,
                    bundle.id,
                    'Identical candidate files exist; version/approval identities remain separate.',
                  ],
                  'Review whether duplicate candidate proposals are necessary.',
                  hash(JSON.stringify(bundle.files)),
                  'HEURISTIC',
                ),
              );
            const evaluated = this.evolution
              .list('evaluation')
              .some((e) => e.bundleHash === bundle.hash && e.status === 'PASSED');
            if (!evaluated)
              add(
                finding(
                  'UNVALIDATED_SKILL',
                  root,
                  'WARNING',
                  [bundle.name, bundle.hash],
                  'Run the applicable behavioral evaluator; format validation alone cannot activate.',
                  bundle.id,
                ),
              );
            const activity = this.evolution.store.db
              .prepare(
                "SELECT data FROM evolution_activity WHERE kind='skillInvocation' AND json_extract(data,'$.bundleHash')=? AND json_extract(data,'$.caseId') LIKE 'workflow:%' AND json_extract(data,'$.status')='COMPLETED' LIMIT 1",
              )
              .get(bundle.hash);
            if (!activity)
              add(
                finding(
                  'UNUSED_SKILL_CANDIDATE',
                  root,
                  'INFO',
                  [
                    bundle.name,
                    'No completed platform workflow invocation is recorded. Evaluations and external/direct Codex use do not establish normal use.',
                  ],
                  'Review actual use before retaining or removing this candidate.',
                  bundle.id,
                  'HEURISTIC',
                ),
              );
            const instructions = bundle.files.find((f) => f.path === 'SKILL.md')?.content || '';
            inspectInstructions(root, 'bundle:' + bundle.id, instructions, registeredRefs).forEach(
              add,
            );
          }
          for (const a of active) {
            try {
              this.skills.verifyActive(target.id, a.name);
            } catch {
              add(
                finding(
                  'ACTIVE_SKILL_DRIFT',
                  root,
                  'ERROR',
                  [a.name, 'Active files differ from the explicitly approved immutable bundle.'],
                  'Inspect the diff; do not overwrite instructions automatically.',
                  a.name,
                ),
              );
            }
          }
          const agents = join(target.path, 'AGENTS.md');
          if (existsSync(agents))
            inspectInstructions(
              root,
              'AGENTS.md',
              readText(target.path, 'AGENTS.md').text,
              registeredRefs,
            ).forEach(add);
          const agentsRoot = join(target.path, '.agents');
          if (existsSync(agentsRoot)) {
            if (realpathSync(agentsRoot) !== agentsRoot)
              throw new AppError(403, 'Agent directory alias');
            for (const entry of readdirSync(agentsRoot, { withFileTypes: true }).slice(0, 100))
              if (/^\.qa-skill-(stage|backup)-/.test(entry.name))
                add(
                  finding(
                    'SKILL_TRANSACTION_REMAINDER',
                    root,
                    'WARNING',
                    [
                      entry.name,
                      'Hidden transaction data is outside active skill discovery; recovery or cleanup needs inspection.',
                    ],
                    'Inspect the activation journal and exact bundle before any cleanup.',
                    entry.name,
                  ),
                );
          }
          const skillDir = join(target.path, '.agents/skills');
          if (existsSync(skillDir)) {
            if (realpathSync(skillDir) !== skillDir)
              throw new AppError(403, 'Skill directory alias');
            for (const entry of readdirSync(skillDir, { withFileTypes: true }).slice(0, 50)) {
              if (entry.isSymbolicLink()) {
                add(
                  finding(
                    'UNSAFE_SKILL_LINK',
                    root,
                    'ERROR',
                    [entry.name],
                    'Review the symlink; no linked instructions were read.',
                    entry.name,
                  ),
                );
                continue;
              }
              const file = join(skillDir, entry.name, 'SKILL.md');
              if (
                !entry.isDirectory() ||
                !existsSync(file) ||
                realpathSync(file) !== file ||
                statSync(file).size > 64000
              )
                continue;
              inspectInstructions(
                root,
                '.agents/skills/' + entry.name + '/SKILL.md',
                readFileSync(file, 'utf8'),
                registeredRefs,
              ).forEach(add);
            }
          }
          for (const source of this.evolution.store
            .list('sources')
            .filter((s) => s.enabled && s.indexEnabled)) {
            const ref: RootRef = { kind: 'source', id: source.id };
            try {
              const cached = this.index.get(ref);
              if (
                cached &&
                cached.files.some((f) => {
                  try {
                    return readText(this.index.root(ref).path, f.path).hash !== f.hash;
                  } catch {
                    return true;
                  }
                })
              )
                add(
                  finding(
                    'SOURCE_INDEX_STALE',
                    'source:' + source.id,
                    'WARNING',
                    ['Configured source index contains changed or missing files.'],
                    'Refresh the opted-in source index explicitly.',
                  ),
                );
            } catch {
              add(
                finding(
                  'SOURCE_UNAVAILABLE',
                  'source:' + source.id,
                  'WARNING',
                  ['Registered source/root/index policy unavailable.'],
                  'Review its registration and read-only/index permissions.',
                ),
              );
            }
          }
          if (targetRevision(target.path) !== initial)
            throw new AppError(
              409,
              'Repository changed during health check; rerun before relying on its snapshot',
            );
        });
      } else
        await check('Platform instruction health', () => {
          inspectInstructions(
            'platform',
            'AGENTS.md',
            readText(this.workspace.platformRoot, 'AGENTS.md').text,
          ).forEach(add);
        });
      if (signal.aborted) throw new AppError(409, 'Cancelled');
      run.status = 'SUCCEEDED';
    } catch {
      run.status = signal.aborted ? 'CANCELLED' : 'FAILED';
      run.error = signal.aborted
        ? 'Cancelled; completed partial findings are retained, not a clean bill of health.'
        : 'Health inspection failed; no passing claim for incomplete checks.';
    } finally {
      run.finishedAt = now();
      this.repository.put(run);
    }
  }
  async shutdown() {
    this.closing = true;
    clearInterval(this.timer);
    if (this.active) {
      this.active.abort.abort();
      await this.active.done;
    }
  }
}
