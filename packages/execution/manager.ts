import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  rmSync,
  realpathSync,
  statfsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  type Framework,
  type Run,
  type Selection,
  type Target,
} from '../domain/model.ts';
import { hash } from '../domain/gherkin.ts';
import { Store } from '../storage/store.ts';
import { Workspace } from '../workspace/workspace.ts';
import { safeFile } from '../workspace/files.ts';
import { karateResults, playwrightResults, readJson, redact, reportFiles } from './reports.ts';

const terminal = new Set(['PASSED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
export class ExecutionManager {
  private active?: { run: Run; child?: ChildProcess };
  private closing = false;
  private logs = new Map<string, string>();
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
    readonly resolveProposalTarget?: (proposalId: string) => Target,
  ) {
    for (const run of store.list('runs'))
      if (
        run.finishedAt &&
        terminal.has(run.status) &&
        Date.now() - Date.parse(run.finishedAt) > store.settings().retentionDays * 86400000
      ) {
        const directory = this.directory(run.id);
        if (
          /^[0-9a-f-]{36}$/.test(run.id) &&
          existsSync(directory) &&
          realpathSync(directory) === directory
        )
          rmSync(directory, { recursive: true });
        run.artifacts = [];
        run.artifactsExpired = true;
        store.put('runs', run);
      }
    for (const run of store.list('runs'))
      if (!terminal.has(run.status) && run.status !== 'QUEUED') {
        run.status = 'INTERRUPTED';
        run.error = 'Platform restarted during execution; no automatic rerun';
        run.finishedAt = new Date().toISOString();
        store.event(run);
      }
  }
  directory(id: string) {
    return join(this.store.directory, 'runs', id);
  }
  busyTarget(id: string) {
    return this.store.list('runs').some((r) => r.targetId === id && !terminal.has(r.status));
  }
  create(
    input: {
      targetId: string;
      framework: Framework;
      selection: Selection;
      baseUrl: string;
      idempotencyKey: string;
    },
    validation?: { proposalId: string; target: Target },
  ) {
    const existing = this.store.list('runs').find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (
        existing.targetId !== input.targetId ||
        existing.framework !== input.framework ||
        existing.baseUrl !== input.baseUrl ||
        JSON.stringify(existing.selection) !== JSON.stringify(input.selection)
      )
        throw new AppError(409, 'Idempotency key belongs to another request');
      return existing;
    }
    const target = validation?.target || this.workspace.target(input.targetId);
    if (target.trustFingerprint !== this.workspace.fingerprint(target))
      throw new AppError(409, 'Trust the current executable project fingerprint before running');
    const snapshot = this.workspace
      .features(target)
      .map(({ path, hash, scenarios }) => ({ path, hash, scenarios }));
    this.selectionArguments(input.framework, input.selection, snapshot, target);
    let url: URL;
    try {
      url = new URL(input.baseUrl);
    } catch {
      throw new AppError(400, 'Invalid environment URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new AppError(400, 'Use an HTTP(S) environment URL without credentials or fragment');
    if (!snapshot.length) throw new AppError(422, 'No canonical features found');
    const disk = statfsSync(this.store.directory);
    if (disk.bavail * disk.bsize < 256_000_000)
      throw new AppError(507, 'At least 256 MB free space is required');
    const version =
      input.framework === 'playwright' &&
      existsSync(join(target.path, 'ui/node_modules/@playwright/test/package.json'))
        ? (
            readJson(join(target.path, 'ui/node_modules/@playwright/test/package.json')) as {
              version: string;
            }
          ).version
        : 'Karate version pinned in target dependency lock';
    const run: Run = {
      ...input,
      ...(validation ? { proposalId: validation.proposalId } : {}),
      id: randomUUID(),
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      tests: [],
      artifacts: [],
      snapshot,
      executableHash: target.trustFingerprint,
      toolchain: { node: process.version, framework: version },
    };
    mkdirSync(this.directory(run.id), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(this.directory(run.id), 'contract-snapshot.json'),
      JSON.stringify(this.workspace.features(target)),
      { mode: 0o600 },
    );
    this.store.event(run);
    void this.pump();
    return run;
  }
  private selectionArguments(
    framework: Framework,
    selection: Selection,
    snapshot: Run['snapshot'],
    target: Target,
  ) {
    const value = selection.value || '';
    if (selection.kind === 'suite')
      return { args: [] as string[], env: {} as Record<string, string> };
    if (selection.kind === 'tags' && !/^@[A-Za-z0-9_:-]{1,100}$/.test(value))
      throw new AppError(400, 'Select one literal @tag');
    const feature = snapshot.find((f) => f.path === value);
    const scenarios = snapshot.flatMap((f) => f.scenarios);
    const scenario = scenarios.find((s) => s.id === value && !s.id.startsWith('unmapped:'));
    if (selection.kind === 'feature' && !feature)
      throw new AppError(400, 'Select a canonical feature');
    if (selection.kind === 'scenario' && !scenario)
      throw new AppError(400, 'Scenario needs a unique @scenario: identity');
    if (selection.kind === 'tags' || selection.kind === 'scenario') {
      const tag = selection.kind === 'tags' ? value : '@scenario:' + scenario!.id;
      return framework === 'playwright'
        ? { args: ['--grep', tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], env: {} }
        : { args: [], env: { QA_TAG: tag } };
    }
    if (framework === 'playwright') {
      const generated = feature!.path.slice('contracts/features/'.length) + '.spec.js';
      if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(generated))
        throw new AppError(422, 'Feature filename is not supported for runner filtering');
      return { args: [generated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], env: {} };
    }
    const manifest = JSON.parse(
      readFileSync(safeFile(target.path, 'contracts/manifest.json'), 'utf8'),
    ) as {
      features: { path: string; scenarios: { bindings?: { karate?: { path: string } } }[] }[];
    };
    const binding = manifest.features.find((f) => f.path === value)?.scenarios[0]?.bindings?.karate
      ?.path;
    if (!binding || !binding.startsWith('api/src/test/resources/'))
      throw new AppError(422, 'No supported Karate feature binding');
    safeFile(target.path, binding);
    return {
      args: [],
      env: { QA_FEATURE: 'classpath:' + binding.slice('api/src/test/resources/'.length) },
    };
  }
  private async command(
    run: Run,
    command: string,
    args: string[],
    cwd: string,
    extra: Record<string, string>,
  ) {
    if (run.status === 'CANCEL_REQUESTED') throw new Error('Cancelled');
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'HOME',
      'JAVA_HOME',
      'GRADLE_USER_HOME',
      'PLAYWRIGHT_BROWSERS_PATH',
      'TMPDIR',
    ])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, {
      CI: 'true',
      QA_BASE_URL: run.baseUrl,
      QA_REPORT_DIR: this.directory(run.id),
      ...extra,
    });
    await new Promise<void>((done, reject) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (child.pid) {
        (run.processGroups ||= []).push(child.pid);
        this.store.event(run);
      }
      if (this.active) this.active.child = child;
      const timeout = setTimeout(() => {
        run.error = 'Runner exceeded 10-minute limit';
        this.terminate(child);
      }, 600_000);
      const append = (chunk: Buffer) => {
        const old = this.logs.get(run.id) || '';
        if (old.length + chunk.length > 2_000_000) {
          run.error = 'Runner exceeded log limit';
          this.terminate(child);
          return;
        }
        this.logs.set(run.id, old + chunk.toString('utf8'));
      };
      child.stdout?.on('data', append);
      child.stderr?.on('data', append);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        run.exitCode = code;
        if (code === 0 && !run.error) done();
        else reject(new Error(run.error || `Runner exited ${code ?? 'by signal'}`));
      });
    });
  }
  private terminate(child: ChildProcess) {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Already exited. */
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* Already exited. */
      }
    }, 1500);
    timer.unref();
  }
  cancel(id: string) {
    const run = this.store.get('runs', id);
    if (!run) throw new AppError(404, 'Run not found');
    if (terminal.has(run.status)) return run;
    if (this.active?.run.id === id) {
      this.active.run.status = 'CANCEL_REQUESTED';
      this.store.event(this.active.run);
      if (this.active.child) this.terminate(this.active.child);
      return this.active.run;
    }
    run.status = 'CANCELLED';
    run.finishedAt = new Date().toISOString();
    this.store.event(run);
    return run;
  }
  log(id: string) {
    if (!this.store.get('runs', id)) throw new AppError(404, 'Run not found');
    const stored = join(this.directory(id), 'runner.log');
    return redact(
      this.logs.get(id) ||
        (existsSync(stored) ? readFileSync(stored, 'utf8') : 'Waiting for runner output…'),
    );
  }
  async pump() {
    if (this.active || this.closing) return;
    const run = this.store.list('runs').find((r) => r.status === 'QUEUED');
    if (!run) return;
    this.active = { run };
    run.status = 'RUNNING';
    run.startedAt = new Date().toISOString();
    this.store.event(run);
    try {
      const target = run.proposalId
        ? this.resolveProposalTarget?.(run.proposalId)
        : this.workspace.target(run.targetId);
      if (!target) throw new Error('Validation proposal is unavailable');
      if (target.trustFingerprint !== this.workspace.fingerprint(target))
        throw new Error('Target executable fingerprint changed after queueing');
      if (run.executableHash !== target.trustFingerprint)
        throw new Error(
          'Queued execution was authorized for another executable revision; start a new run',
        );
      const current = this.workspace.features(target);
      if (
        current.length !== run.snapshot.length ||
        current.some((f) => !run.snapshot.some((s) => s.path === f.path && s.hash === f.hash))
      )
        throw new Error('Contract changed after queueing; review and rerun');
      if (run.framework === 'karate') {
        const manifest = readJson(safeFile(target.path, 'contracts/manifest.json')) as {
          features: { path: string; canonicalHash?: string }[];
        };
        const relevant =
          run.selection.kind === 'feature'
            ? current.filter((f) => f.path === run.selection.value)
            : current;
        if (
          relevant.some(
            (f) => manifest.features.find((m) => m.path === f.path)?.canonicalHash !== f.hash,
          )
        )
          throw new Error(
            'Karate binding is stale for the canonical contract. Review the API assertions and update its manifest hash explicitly.',
          );
      }
      const selection = this.selectionArguments(run.framework, run.selection, run.snapshot, target);
      if (run.framework === 'playwright') {
        const cwd = join(target.path, 'ui');
        if (run.proposalId)
          await this.command(
            run,
            process.execPath,
            [join(cwd, 'node_modules/typescript/bin/tsc'), '--noEmit'],
            cwd,
            {},
          );
        await this.command(
          run,
          process.execPath,
          [join(cwd, 'node_modules/playwright-bdd/dist/cli/index.js')],
          cwd,
          {},
        );
        await this.command(
          run,
          process.execPath,
          [join(cwd, 'node_modules/@playwright/test/cli.js'), 'test', ...selection.args],
          cwd,
          selection.env,
        );
        run.tests = playwrightResults(readJson(join(this.directory(run.id), 'results.json')), run);
      } else {
        const cwd = join(target.path, 'api');
        await this.command(
          run,
          resolve(cwd, 'gradlew'),
          ['test', '--no-daemon', '--rerun-tasks', '--offline', '--console=plain'],
          cwd,
          selection.env,
        );
        run.tests = reportFiles(this.directory(run.id))
          .filter((p) => p.startsWith('cucumber-json/') && p.endsWith('.json'))
          .flatMap((p) => karateResults(readJson(join(this.directory(run.id), p)), run));
      }
      if (!run.tests.length) throw new Error('No executed scenarios in native report');
      run.status = run.tests.every((t) => t.status === 'PASSED') ? 'PASSED' : 'FAILED';
    } catch (error) {
      run.error = redact(error instanceof Error ? error.message : 'Execution failed');
      run.status = (run as Run).status === 'CANCEL_REQUESTED' ? 'CANCELLED' : 'FAILED';
      try {
        if (
          run.framework === 'playwright' &&
          existsSync(join(this.directory(run.id), 'results.json'))
        )
          run.tests = playwrightResults(
            readJson(join(this.directory(run.id), 'results.json')),
            run,
          );
        if (run.framework === 'karate')
          run.tests = reportFiles(this.directory(run.id))
            .filter((p) => p.startsWith('cucumber-json/') && p.endsWith('.json'))
            .flatMap((p) => karateResults(readJson(join(this.directory(run.id), p)), run));
      } catch {
        /* Partial/malformed native output remains failed, never success. */
      }
    } finally {
      try {
        writeFileSync(join(this.directory(run.id), 'runner.log'), this.log(run.id), {
          mode: 0o600,
        });
        const files = reportFiles(this.directory(run.id));
        const total = files.reduce(
          (sum, path) => sum + statSync(join(this.directory(run.id), path)).size,
          0,
        );
        if (files.length > 1000 || total > 256_000_000) {
          if (run.status !== 'CANCELLED') run.status = 'FAILED';
          run.error = 'Native artifacts exceeded the 256 MB / 1000 file limit';
        } else
          run.artifacts = files.map((name) => ({
            name,
            size: statSync(join(this.directory(run.id), name)).size,
            hash: hash(readFileSync(join(this.directory(run.id), name))),
          }));
      } catch (error) {
        if (run.status !== 'CANCELLED') run.status = 'FAILED';
        run.error = redact(error instanceof Error ? error.message : 'Artifact collection failed');
      } finally {
        run.finishedAt = new Date().toISOString();
        try {
          this.store.event(run);
        } catch {
          this.closing = true;
          console.error(
            'Run state persistence failed; queue stopped. Check database/storage health.',
          );
        }
        this.logs.delete(run.id);
        this.active = undefined;
        void this.pump();
      }
    }
  }
  close() {
    this.closing = true;
    if (this.active) {
      this.active.run.status = 'CANCEL_REQUESTED';
      if (this.active.child) this.terminate(this.active.child);
    }
  }
  async shutdown() {
    this.close();
    while (this.active) await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
