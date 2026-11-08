import {
  adviceInstruction,
  adviceSchema,
  failureEvidence,
  latestHealth,
  validateReply,
} from './advice.ts';
import type { FailureDiscussion } from './model.ts';
import { hybridPlan } from './hybrid.ts';
import {
  boundApiFeaturePath,
  equivalentSchemaAssertions,
  bindKarate,
  requireSupportedOperation,
  validateKarate,
} from './karate.ts';
import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { AppError, type Framework, type Target } from '../domain/model.ts';
import { hash, parseFeature } from '../domain/gherkin.ts';
import { Store } from '../storage/store.ts';
import { Workspace } from '../workspace/workspace.ts';
import { safeFile } from '../workspace/files.ts';
import { RecordingManager } from '../recording/manager.ts';
import { safeText } from '../recording/privacy.ts';
import { redact } from '../execution/reports.ts';
import { ExecutionManager } from '../execution/manager.ts';
import { CapabilityIndex, extractCapabilities, type RootRef } from '../intelligence/index.ts';
import {
  CODEX_VERSION,
  CodexConnection,
  asObject,
  type AgentProvider,
  type AgentRequest,
} from './provider.ts';
import { GenerationRepository } from './repository.ts';
import {
  analysisSchema,
  implementationSchema,
  tools,
  analysisInstruction,
  implementationInstruction,
  karateInstruction,
} from './prompts.ts';
import { privateDirectory } from './private-directory.ts';
import type {
  AiSettings,
  GenerationTask,
  ContractProposal,
  ChangeProposal,
  Claim,
  FileChange,
} from './model.ts';
import {
  allowedChangePath,
  currentText,
  targetRevision,
  validateGeneratedFile,
  makeDiff,
  buildStage,
  applyFiles,
  preserveExistingCapabilities,
} from './staging.ts';

const text = (value: unknown, max = 32000) => {
  if (typeof value !== 'string' || value.length > max)
    throw new AppError(400, 'Invalid text or text limit exceeded');
  return value;
};
const list = (value: unknown, max = 40) => {
  if (!Array.isArray(value) || value.length > max)
    throw new AppError(400, 'Invalid array or item limit exceeded');
  return value as unknown[];
};
const clean = (value: string) =>
  redact(value)
    .match(/[\s\S]{1,8000}/g)
    ?.map((s) => safeText(s))
    .join('') || '';
const scrub = <T>(value: T): T => {
  if (typeof value === 'string') return clean(value) as T;
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)])) as T;
  return value;
};
const contractDigest = (
  gherkin: string,
  answers: { id: string; text: string }[],
  evidenceHash: string,
  featurePath: string,
  targetId: string,
  recordingId: string,
) => hash(JSON.stringify({ gherkin, answers, evidenceHash, featurePath, targetId, recordingId }));

export class GenerationManager {
  readonly repository: GenerationRepository;
  readonly index: CapabilityIndex;
  readonly home: string;
  readonly stagingRoot: string;
  private active?: { id: string; abort: AbortController; done: Promise<void> };
  private connections = new Set<CodexConnection>();
  readonly executionClass: 'CODEX' | 'CUSTOM';
  onApplied?: (change: ChangeProposal) => void;
  knowledgeLookup?: (
    ref: RootRef,
    path: string,
  ) => { id: string; hash: string; [key: string]: unknown }[];
  knowledgeFresh?: (id: string, hash: string) => boolean;
  private providerFactory: (settings: AiSettings, cwd: string) => AgentProvider;
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
    readonly recorder: RecordingManager,
    readonly runner: ExecutionManager,
    providerFactory?: (settings: AiSettings, cwd: string) => AgentProvider,
  ) {
    this.executionClass = providerFactory ? 'CUSTOM' : 'CODEX';
    this.repository = new GenerationRepository(store);
    this.index = new CapabilityIndex(store, workspace);
    const root = join(store.directory, 'generation');
    privateDirectory(root);
    this.home = join(root, 'codex-home');
    this.stagingRoot = join(root, 'staging');
    privateDirectory(this.stagingRoot);
    this.providerFactory =
      providerFactory || ((settings, cwd) => new CodexConnection(settings.binary, this.home, cwd));
    for (const change of this.repository.list('changes')) {
      const journal = join(root, change.id + '.journal.json');
      if (existsSync(journal) && !['APPLIED', 'REJECTED'].includes(change.status)) {
        const data = JSON.parse(readFileSync(journal, 'utf8')) as { state: string };
        change.status = 'APPLY_FAILED';
        change.error = 'Application journal ' + data.state + '; inspect before manual recovery';
        this.repository.put('changes', change);
      }
      const stage = join(this.stagingRoot, change.id);
      if (
        Date.now() - Date.parse(change.createdAt) > store.settings().retentionDays * 86400000 &&
        existsSync(stage) &&
        realpathSync(stage) === stage
      )
        rmSync(stage, { recursive: true });
    }
  }
  private verifyBinary(binary: string, confirmExecution: boolean) {
    if (!confirmExecution)
      throw new AppError(403, 'Explicit trust of the Codex executable is required');
    if (!isAbsolute(binary) || realpathSync(binary) !== binary || !lstatSync(binary).isFile())
      throw new AppError(400, 'Choose a canonical absolute Codex executable');
    const version = execFileSync(binary, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (version !== 'codex-cli ' + CODEX_VERSION)
      throw new AppError(422, 'Supported Codex version: ' + CODEX_VERSION);
    return hash(readFileSync(binary));
  }
  trustCli(binary: string, confirmExecution: boolean) {
    if (this.active) throw new AppError(409, 'Cancel the active AI task first');
    return this.repository.settings({
      ...this.repository.settings(),
      enabled: false,
      binary,
      binaryHash: this.verifyBinary(binary, confirmExecution),
    });
  }
  configure(input: Omit<AiSettings, 'binaryHash'>, confirmExecution: boolean) {
    if (this.active)
      throw new AppError(409, 'Cancel the active AI task before changing configuration');
    if (!input.enabled)
      return this.repository.settings({ ...this.repository.settings(), enabled: false });
    const binaryHash = this.verifyBinary(input.binary, confirmExecution);
    for (const model of [input.analysisModel, input.implementationModel])
      if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(model))
        throw new AppError(400, 'Select an explicit model from the provider catalog');
    for (const effort of [input.analysisEffort, input.implementationEffort])
      if (!['low', 'medium', 'high', 'xhigh'].includes(effort))
        throw new AppError(400, 'Unsupported reasoning effort');
    return this.repository.settings({ ...input, binaryHash });
  }
  private settings(requireEnabled = true) {
    const s = this.repository.settings();
    if (requireEnabled && !s.enabled)
      throw new AppError(409, 'AI is disabled; manual workflows remain available');
    if (!s.binary) throw new AppError(409, 'Trust a supported Codex executable first');
    if (hash(readFileSync(s.binary)) !== s.binaryHash)
      throw new AppError(409, 'Codex executable changed; review configuration again');
    return s;
  }
  async connectionInfo() {
    if (this.active) throw new AppError(409, 'Wait for or cancel the active AI task first');
    const settings = this.settings(false);
    const connection = new CodexConnection(
      settings.binary,
      this.home,
      join(this.store.directory, 'generation', 'catalog'),
    );
    this.connections.add(connection);
    try {
      const protocol = await connection.connect();
      return { protocol, account: await connection.account(), catalog: await connection.catalog() };
    } finally {
      await connection.close();
      this.connections.delete(connection);
    }
  }
  private evidence(recordingId: string) {
    const recording = this.recorder.repository.get(recordingId);
    if (['STARTING', 'RECORDING', 'STOPPING'].includes(recording.status))
      throw new AppError(409, 'Stop the recording before analysis');
    const transcript = recording.transcript.at(-1);
    const digest = createHash('sha256').update(
      JSON.stringify({ status: recording.status, incomplete: recording.incomplete, transcript }),
    );
    let bytes = 0,
      relevantEvents = 0;
    const selected = [];
    for (const e of this.recorder.repository.iterateEvents(recordingId)) {
      digest.update(JSON.stringify(e));
      if (!['action', 'context', 'navigation', 'gap'].includes(e.kind)) continue;
      relevantEvents++;
      if (selected.length >= 80) continue;
      const item = {
        id: 'event:' + e.sequence,
        kind: e.kind,
        provenance: e.provenance,
        timeMs: e.timeMs,
        sourceEventId: e.sourceEventId,
        detail: clean(e.detail),
        aria: clean(e.aria || '').slice(0, 1000),
        locators: e.locators?.slice(0, 6),
        url: e.url,
      };
      const size = Buffer.byteLength(JSON.stringify(item));
      if (bytes + size > 20000) continue;
      bytes += size;
      selected.push(item);
    }
    const evidenceHash = digest.digest('hex');
    const narrated = (transcript?.segments || [])
      .slice(0, 40)
      .map((s, i) => ({ id: 'narration:' + i, ...s, text: clean(s.text).slice(0, 2000) }));
    if (Buffer.byteLength(JSON.stringify(narrated)) > 12000)
      throw new AppError(413, 'Narration exceeds AI context budget; narrow the recording');
    const ids = new Set([...selected.map((e) => e.id), ...narrated.map((e) => e.id)]);
    return {
      evidenceHash,
      ids,
      data: {
        recordingId,
        status: recording.status,
        incomplete: recording.incomplete,
        events: selected,
        narration: narrated,
        truncated:
          relevantEvents > selected.length || (transcript?.segments.length || 0) > narrated.length,
        transcriptRevision: transcript?.revision || 0,
      },
    };
  }
  private assertFresh(contract: ContractProposal) {
    if (this.evidence(contract.recordingId).evidenceHash !== contract.evidenceHash)
      throw new AppError(409, 'Recording/narration changed; analyze and review again');
    const target = this.workspace.target(contract.targetId);
    if (targetRevision(target.path) !== contract.targetRevision)
      throw new AppError(409, 'Target changed; analyze and review a fresh base');
    return target;
  }
  private dependenciesFresh(task: GenerationTask) {
    for (const fact of task.knowledgeRefs || [])
      if (!this.knowledgeFresh?.(fact.id, fact.hash))
        throw new AppError(
          409,
          'Retrieved knowledge approval/content changed; repeat generation with current evidence',
        );
    for (const f of task.contextFiles) {
      const root = this.index.root(f.ref);
      if (
        !this.index
          .get(f.ref)
          ?.files.some((indexed) => indexed.path === f.path && indexed.hash === f.hash)
      )
        throw new AppError(409, 'Context index or policy changed');
      if (hash(readFileSync(safeFile(root.path, f.path))) !== f.hash)
        throw new AppError(409, 'Retrieved context changed');
    }
  }
  private start(
    kind: GenerationTask['kind'],
    targetId: string,
    recordingId: string | undefined,
    refs: RootRef[],
    prompt: string | ((signal: AbortSignal) => Promise<string>),
    schema: unknown,
    complete: (result: unknown, task: GenerationTask) => void,
    contractId?: string,
  ) {
    if (this.active) throw new AppError(409, 'One AI task may run at a time');
    const settings = this.settings();
    const abort = new AbortController();
    const task: GenerationTask = {
      id: randomUUID(),
      kind,
      status: 'RUNNING',
      targetId,
      recordingId,
      contractId,
      createdAt: new Date().toISOString(),
      events: [],
      contextFiles: [],
      retrievalBytes: 0,
      promptBytes: 0,
      toolCalls: 0,
      searches: [],
      knowledgeRefs: [],
      executionClass: this.executionClass,
      model: kind === 'implementation' ? settings.implementationModel : settings.analysisModel,
      usage: null,
    };
    this.repository.put('tasks', task);
    const save = () => this.repository.put('tasks', task);
    const onEvent: AgentRequest['onEvent'] = (event) => {
      if (abort.signal.aborted) return;
      if (event.kind === 'usage') task.usage = event.data;
      if (event.kind === 'message' && task.events.at(-1)?.kind === 'message')
        task.events.at(-1)!.text = (task.events.at(-1)!.text + clean(event.text)).slice(0, 4000);
      else if (task.events.length < 160)
        task.events.push({
          ...event,
          text: clean(event.text).slice(0, 2000),
          at: new Date().toISOString(),
        });
      save();
    };
    const remember = (ref: RootRef, path: string, digest: string, bytes: number) => {
      const old = task.contextFiles.find(
        (f) => f.ref.id === ref.id && f.ref.kind === ref.kind && f.path === path,
      );
      if (old) {
        if (old.hash !== digest) throw new AppError(409, 'Context changed during task');
        old.bytes = Math.max(old.bytes, bytes);
      } else {
        if (task.contextFiles.length >= 32)
          throw new AppError(413, 'Context dependency limit reached');
        task.contextFiles.push({ ref, path, hash: digest, bytes });
      }
      save();
    };
    const retrieved = (payload: unknown) => {
      const bytes = Buffer.byteLength(JSON.stringify(payload));
      if (task.retrievalBytes + bytes > 64000) {
        abort.abort('Context retrieval budget reached');
        throw new AppError(413, '64 KB context retrieval budget reached');
      }
      task.retrievalBytes += bytes;
      save();
      return payload;
    };
    const onTool: AgentRequest['onTool'] = async (name, args) => {
      if (abort.signal.aborted) throw new AppError(409, 'Cancelled task');
      if (++task.toolCalls > 16) {
        abort.abort('Tool budget reached');
        throw new AppError(413, 'Task tool budget reached');
      }
      const input = asObject(args);
      if (name === 'qa_lookup') {
        const query = text(input.query, 200);
        task.searches!.push({
          queryHash: hash(query.trim().toLowerCase().replace(/\s+/g, ' ')),
          scopeHash: hash(
            JSON.stringify(
              refs.map((ref) => ({ ref, treeHash: this.index.get(ref)?.treeHash || null })),
            ),
          ),
        });
        save();
        const hits = refs
          .flatMap((ref) => this.index.lookup(ref, query))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        for (const hit of hits) if (!hit.stale) remember(hit.ref, hit.path, hit.hash, 0);
        return retrieved(
          hits.map((h) => {
            const advisoryKnowledge = this.knowledgeLookup?.(h.ref, h.path) || [];
            for (const fact of advisoryKnowledge)
              if (!task.knowledgeRefs!.some((k) => k.id === fact.id && k.hash === fact.hash)) {
                if (task.knowledgeRefs!.length >= 32)
                  throw new AppError(413, 'Knowledge dependency limit reached');
                task.knowledgeRefs!.push({ id: fact.id, hash: fact.hash });
              }
            save();
            return {
              ...h,
              capabilities: scrub(h.capabilities),
              ...(advisoryKnowledge.length ? { advisoryKnowledge: scrub(advisoryKnowledge) } : {}),
            };
          }),
        );
      }
      if (name !== 'qa_read_file') throw new AppError(403, 'Tool is not authorized');
      const ref: RootRef = {
        kind: text(input.kind, 20) as RootRef['kind'],
        id: text(input.id, 100),
      };
      if (!refs.some((r) => r.kind === ref.kind && r.id === ref.id))
        throw new AppError(403, 'Repository is outside task scope');
      const file = this.index.read(ref, text(input.path, 200));
      const previous = task.contextFiles.find(
        (f) => f.path === file.path && f.ref.kind === ref.kind && f.ref.id === ref.id,
      );
      if (!previous?.bytes && task.contextFiles.filter((f) => f.bytes > 0).length >= 8)
        throw new AppError(413, 'Eight context files maximum');
      const cleaned = clean(file.text);
      const bytes = Buffer.byteLength(cleaned);
      remember(ref, file.path, file.hash, bytes);
      return retrieved({
        ...file,
        text: cleaned,
        capabilities: scrub(file.capabilities),
        redacted: cleaned !== file.text,
      });
    };
    const done = (async () => {
      await Promise.resolve();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        timer = setTimeout(() => abort.abort('Task deadline exceeded'), 300000);
        const preparedPrompt = typeof prompt === 'function' ? await prompt(abort.signal) : prompt;
        if (abort.signal.aborted) throw new Error('Task cancelled');
        task.promptBytes = Buffer.byteLength(preparedPrompt);
        save();
        const result = await this.providerFactory(
          settings,
          join(this.store.directory, 'generation', 'tasks', task.id),
        ).run({
          prompt: preparedPrompt,
          schema,
          tools,
          signal: abort.signal,
          onEvent,
          onTool,
          model: task.model,
          effort:
            kind === 'implementation' ? settings.implementationEffort : settings.analysisEffort,
        });
        if (abort.signal.aborted) throw new Error('Task cancelled');
        task.usage = result.usage ?? task.usage;
        task.model = result.model;
        this.dependenciesFresh(task);
        complete(result.output, task);
        task.status = 'SUCCEEDED';
      } catch (e) {
        task.status =
          abort.signal.aborted &&
          !abort.signal.reason?.toString().includes('budget') &&
          !abort.signal.reason?.toString().includes('deadline')
            ? 'CANCELLED'
            : 'FAILED';
        task.error = clean(
          abort.signal.aborted && typeof abort.signal.reason === 'string'
            ? abort.signal.reason
            : e instanceof Error
              ? e.message
              : 'Agent failed',
        ).slice(0, 1000);
      } finally {
        clearTimeout(timer);
        task.finishedAt = new Date().toISOString();
        save();
        if (this.active?.id === task.id) this.active = undefined;
      }
    })();
    this.active = { id: task.id, abort, done };
    return task;
  }
  discussion(runId: string): FailureDiscussion {
    const run = this.store.get('runs', runId);
    if (!run) throw new AppError(404, 'Run not found');
    try {
      return this.repository.get('discussions', runId);
    } catch (e) {
      if (!(e instanceof AppError) || e.statusCode !== 404) throw e;
    }
    return { id: runId, targetId: run.targetId, turns: [] };
  }
  async discussFailure(
    runId: string,
    input: { message: string; includeHealth: boolean; language: 'en' | 'es' },
  ) {
    const run = this.store.get('runs', runId);
    if (!run || !['FAILED', 'INTERRUPTED'].includes(run.status))
      throw new AppError(422, 'Choose a completed failed run');
    if (!input.message.trim() || input.message.length > 4000)
      throw new AppError(400, 'Question must contain 1–4000 characters');
    this.workspace.target(run.targetId);
    const discussion = this.discussion(runId);
    if (discussion.turns.length >= 20)
      throw new AppError(
        413,
        'Conversation limit reached (20 turns). Inspect the evidence before starting further diagnosis.',
      );
    const ref: RootRef = { kind: 'target', id: run.targetId };
    let proposal: unknown = null;
    if (run.proposalId && !run.proposalId.startsWith('repair-')) {
      const change = this.repository.get('changes', run.proposalId);
      if (change.targetId !== run.targetId) throw new AppError(409, 'Proposal target mismatch');
      proposal = {
        id: change.id,
        hash: change.hash,
        matchesExecutedFingerprint: Boolean(
          run.executableHash && change.validationFingerprint === run.executableHash,
        ),
        note: 'Current proposed files, not necessarily the historical executed version.',
        files: change.files.slice(0, 4).map((f) => ({
          path: f.path,
          content: f.after.slice(0, 5000),
          truncated: f.after.length > 5000,
        })),
      };
    }
    const evidence = failureEvidence(run, this.runner.log(run.id));
    const history: FailureDiscussion['turns'] = [];
    let historyBytes = 0;
    for (const turn of discussion.turns
      .filter((t) => t.reply)
      .slice(-4)
      .reverse()) {
      const bytes = Buffer.byteLength(JSON.stringify(turn));
      if (historyBytes + bytes > 24000) break;
      history.unshift(turn);
      historyBytes += bytes;
    }
    const task = this.start(
      'diagnosis',
      run.targetId,
      undefined,
      [ref],
      async (signal) => {
        await this.index.scan(ref, signal);
        const prompt = JSON.stringify(
          scrub({
            task: adviceInstruction,
            language: input.language,
            repositories: [ref],
            evidence,
            proposal,
            autohealth: input.includeHealth ? latestHealth(this.store, run.targetId) : null,
            history,
            historyIsBounded: true,
            question: input.message,
          }),
        );
        if (Buffer.byteLength(prompt) > 96000)
          throw new AppError(413, 'Diagnostic context too large. Narrow the evidence.');
        return prompt;
      },
      adviceSchema,
      (result) => {
        const current = this.repository.get('discussions', runId);
        const turn = current.turns.find((t) => t.taskId === task.id)!;
        turn.reply = scrub(validateReply(result));
        this.repository.put('discussions', current);
      },
    );
    discussion.turns.push({
      taskId: task.id,
      question: clean(input.message),
      createdAt: task.createdAt,
    });
    this.repository.put('discussions', discussion);
    return { task, discussion };
  }
  async analyze(input: {
    targetId: string;
    recordingId: string;
    featurePath: string;
    sourceIds: string[];
  }) {
    const target = this.workspace.target(input.targetId);
    allowedChangePath(input.featurePath);
    if (!input.featurePath.startsWith('contracts/features/'))
      throw new AppError(400, 'Choose a Gherkin feature destination');
    const refs: RootRef[] = [
      { kind: 'target', id: target.id },
      ...input.sourceIds.map((id) => ({ kind: 'source' as const, id })),
    ];
    for (const ref of refs) this.index.root(ref);
    const evidence = this.evidence(input.recordingId);
    const revision = targetRevision(target.path);
    const existing = currentText(target.path, input.featurePath);
    const prompt = async (signal: AbortSignal) => {
      for (const ref of refs) {
        if (signal.aborted) throw new Error('Task cancelled');
        await this.index.scan(ref, signal);
      }
      return JSON.stringify({
        task: analysisInstruction,
        featurePath: input.featurePath,
        existingContract: existing ? clean(existing) : null,
        repositories: refs,
        evidence: evidence.data,
      });
    };
    return this.start(
      'analysis',
      target.id,
      input.recordingId,
      refs,
      prompt,
      analysisSchema,
      (raw, task) => {
        if (
          this.evidence(input.recordingId).evidenceHash !== evidence.evidenceHash ||
          targetRevision(target.path) !== revision
        )
          throw new AppError(409, 'Analysis base changed');
        const result = asObject(raw);
        const gherkin = text(result.gherkin);
        parseFeature(gherkin, input.featurePath);
        const claims: Claim[] = list(result.claims).map((value) => {
          const c = asObject(value);
          const provenance = text(c.provenance, 20) as Claim['provenance'];
          if (!['OBSERVED', 'NARRATED', 'INFERRED'].includes(provenance))
            throw new AppError(422, 'Invalid claim provenance');
          const evidenceIds = list(c.evidenceIds, 20).map((v) => text(v, 100));
          if (
            provenance !== 'INFERRED' &&
            (!evidenceIds.length || evidenceIds.some((id) => !evidence.ids.has(id)))
          )
            throw new AppError(422, 'Claim has missing/unknown evidence');
          if (
            (provenance === 'OBSERVED' && evidenceIds.some((id) => !id.startsWith('event:'))) ||
            (provenance === 'NARRATED' && evidenceIds.some((id) => !id.startsWith('narration:')))
          )
            throw new AppError(422, 'Claim provenance does not match evidence');
          return { text: text(c.text, 2000), provenance, evidenceIds };
        });
        const questions = list(result.questions).map((value) => ({
          id: randomUUID(),
          text: text(value, 2000),
        }));
        if (claims.some((c) => c.provenance === 'INFERRED') && !questions.length)
          questions.push({
            id: randomUUID(),
            text: 'Confirm or correct inferred requirements before approval.',
          });
        if (evidence.data.truncated)
          questions.push({
            id: randomUUID(),
            text: 'Some recording context was omitted by retrieval limits. Confirm the reviewed behavior against the full recording.',
          });
        if (evidence.data.incomplete)
          questions.push({
            id: randomUUID(),
            text: 'Recording is incomplete. Confirm the reviewed contract and identify any missing behavior.',
          });
        const contract: ContractProposal = {
          id: randomUUID(),
          taskId: task.id,
          targetId: target.id,
          recordingId: input.recordingId,
          featurePath: input.featurePath,
          evidenceHash: evidence.evidenceHash,
          targetRevision: revision,
          gherkin,
          hash: contractDigest(
            gherkin,
            [],
            evidence.evidenceHash,
            input.featurePath,
            target.id,
            input.recordingId,
          ),
          claims,
          questions,
          sourceIds: input.sourceIds,
          answers: [],
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
        };
        this.repository.put('contracts', contract);
        task.contractId = contract.id;
      },
    );
  }
  review(
    id: string,
    input: {
      expectedHash: string;
      gherkin: string;
      answers: { id: string; text: string }[];
      approve: boolean;
    },
  ) {
    const contract = this.repository.get('contracts', id);
    this.assertFresh(contract);
    this.dependenciesFresh(this.repository.get('tasks', contract.taskId));
    if (contract.hash !== input.expectedHash) throw new AppError(409, 'Contract revision changed');
    if (contract.status === 'REJECTED')
      throw new AppError(409, 'Rejected contract cannot be reused');
    const parsed = parseFeature(input.gherkin, contract.featurePath);
    if (input.approve && parsed.scenarios.some((s) => s.id.startsWith('unmapped:')))
      throw new AppError(422, 'Add a stable @scenario: identifier before approving implementation');
    if (
      input.approve &&
      contract.questions.some((q) => !input.answers.some((a) => a.id === q.id && a.text.trim()))
    )
      throw new AppError(422, 'Answer every open question before approving requirements');
    const priorHash = contract.hash;
    contract.gherkin = input.gherkin;
    contract.hash = contractDigest(
      input.gherkin,
      input.answers,
      contract.evidenceHash,
      contract.featurePath,
      contract.targetId,
      contract.recordingId,
    );
    contract.answers = input.answers;
    contract.status = input.approve ? 'APPROVED' : 'DRAFT';
    contract.approval = input.approve
      ? { hash: contract.hash, at: new Date().toISOString(), reviewer: 'local-user' }
      : undefined;
    if (!input.approve || priorHash !== contract.hash) this.invalidateContractWork(id);
    return this.repository.put('contracts', contract);
  }
  private invalidateContractWork(id: string) {
    if (this.active) {
      const task = this.repository.get('tasks', this.active.id);
      if (task.contractId === id) this.cancel(task.id);
    }
    for (const change of this.repository.changesForContract(id)) {
      if (!['STAGED', 'VALIDATING', 'VALIDATED'].includes(change.status)) continue;
      if (change.status === 'VALIDATING' && change.validationRunId)
        this.runner.cancel(change.validationRunId);
      change.status = 'INVALIDATED';
      change.error =
        'Contract approval was revoked or its revision changed; generate a new proposal after review';
      change.approval = undefined;
      this.repository.put('changes', change);
    }
  }
  rejectContract(id: string) {
    const contract = this.repository.get('contracts', id);
    contract.status = 'REJECTED';
    contract.approval = undefined;
    this.invalidateContractWork(id);
    return this.repository.put('contracts', contract);
  }
  hybridPlan(contractId: string) {
    const contract = this.repository.get('contracts', contractId);
    this.assertFresh(contract);
    const index = this.index.get({ kind: 'target', id: contract.targetId });
    if (!index) throw new AppError(409, 'Index the target before planning');
    return hybridPlan(index);
  }
  endpoints(contractId: string) {
    const contract = this.repository.get('contracts', contractId);
    return contract.sourceIds.flatMap((id) => {
      const ref: RootRef = { kind: 'source', id };
      return (this.index.get(ref)?.files || []).flatMap((file) =>
        file.capabilities
          .filter((c) => c.kind === 'endpoint' && c.operation)
          .map((c) => ({
            ref,
            path: file.path,
            hash: file.hash,
            symbol: c.name,
            operation: c.operation,
          })),
      );
    });
  }
  async implement(
    contractId: string,
    expectedHash: string,
    options: {
      framework?: Framework;
      endpoint?: { ref: RootRef; path: string; symbol: string; hash: string };
    } = {},
  ) {
    const contract = this.repository.get('contracts', contractId);
    if (
      contract.status !== 'APPROVED' ||
      contract.hash !== expectedHash ||
      contract.approval?.hash !== contract.hash
    )
      throw new AppError(403, 'Approve this exact Gherkin revision first');
    const target = this.assertFresh(contract);
    this.dependenciesFresh(this.repository.get('tasks', contract.taskId));
    if (
      clean(contract.gherkin) !== contract.gherkin ||
      /\[REDACTED\]/.test(contract.gherkin) ||
      contract.answers.some((a) => clean(a.text) !== a.text)
    )
      throw new AppError(
        422,
        'Replace sensitive values with safe references before AI implementation; manual editing remains available',
      );
    const refs: RootRef[] = [
      { kind: 'target', id: target.id },
      ...contract.sourceIds.map((id) => ({ kind: 'source' as const, id })),
    ];
    for (const ref of refs)
      if (!this.index.get(ref)) throw new AppError(409, 'Required repository index is unavailable');
    const framework = options.framework || 'playwright';
    if (!['playwright', 'karate'].includes(framework))
      throw new AppError(400, 'Unsupported framework');
    const endpoint =
      framework === 'karate'
        ? this.endpoints(contractId).find(
            (e) =>
              e.ref.kind === options.endpoint?.ref.kind &&
              e.ref.id === options.endpoint.ref.id &&
              e.path === options.endpoint.path &&
              e.symbol === options.endpoint.symbol &&
              e.hash === options.endpoint.hash,
          )
        : undefined;
    if (framework === 'karate') {
      if (!endpoint?.operation)
        throw new AppError(
          422,
          'Select a current discovered API endpoint from an authorized source.',
        );
      requireSupportedOperation(endpoint.operation);
      const selected = this.index.read(endpoint.ref, endpoint.path);
      if (clean(selected.text) !== selected.text)
        throw new AppError(
          422,
          'Replace sensitive API contract values with safe references before generation',
        );
    }
    const apiPath = boundApiFeaturePath(
      currentText(target.path, 'contracts/manifest.json')!,
      contract.featurePath,
    );
    allowedChangePath(apiPath);
    if (!apiPath.startsWith('api/src/test/resources/features/'))
      throw new AppError(422, 'Unsupported existing API binding path');
    const prompt = JSON.stringify({
      task: framework === 'karate' ? karateInstruction : implementationInstruction,
      framework,
      ...(endpoint ? { endpoint, apiFeaturePath: apiPath } : {}),
      repositories: refs,
      featurePath: contract.featurePath,
      gherkin: contract.gherkin,
      answers: contract.answers,
      evidence: this.evidence(contract.recordingId).data,
      allowedPaths:
        framework === 'karate'
          ? [apiPath]
          : [
              'ui/pages/*.ts',
              'ui/components/*.ts',
              'ui/steps/*.ts',
              'ui/builders/*.ts',
              'ui/fixtures.ts',
            ],
    });
    return this.start(
      'implementation',
      target.id,
      contract.recordingId,
      refs,
      prompt,
      implementationSchema,
      (raw, task) => {
        this.assertFresh(contract);
        const current = this.repository.get('contracts', contract.id);
        if (current.hash !== contract.hash || current.status !== 'APPROVED')
          throw new AppError(409, 'Contract approval changed during generation');
        const result = asObject(raw),
          p = asObject(result.plan);
        const reuse = list(p.reuse, 20).map((v) => {
          const r = asObject(v);
          return { path: text(r.path, 180), symbol: text(r.symbol, 240) };
        });
        const targetIndex = this.index.get({ kind: 'target', id: target.id })!;
        for (const r of reuse)
          if (
            !targetIndex.files.some(
              (f) => f.path === r.path && f.capabilities.some((c) => c.name === r.symbol),
            )
          )
            throw new AppError(
              422,
              'Reuse plan names an unknown capability: ' +
                r.path +
                ' · ' +
                r.symbol +
                '; use exact indexed names',
            );
        if (
          framework === 'playwright' &&
          targetIndex.files.some((f) =>
            f.capabilities.some((c) => ['page', 'component'].includes(c.kind)),
          ) &&
          !reuse.length
        )
          throw new AppError(422, 'Inspect and justify existing Page/component reuse');
        const proposed = list(result.files, 8).map((v) => {
          const f = asObject(v);
          return { path: text(f.path, 180), content: text(f.content) };
        });
        if (new Set(proposed.map((f) => f.path)).size !== proposed.length)
          throw new AppError(422, 'Duplicate output paths');
        if (
          proposed.some(
            (f) =>
              f.path === 'contracts/manifest.json' ||
              (framework === 'playwright' ? f.path.startsWith('api/') : f.path.startsWith('ui/')),
          )
        )
          throw new AppError(403, 'Proposal exceeds the selected framework scope');
        if (proposed.some((f) => f.path.startsWith('contracts/') && f.content !== contract.gherkin))
          throw new AppError(422, 'Generated contract differs from reviewed Gherkin');
        if (!proposed.some((f) => f.path === contract.featurePath))
          proposed.push({ path: contract.featurePath, content: contract.gherkin });
        let schemaEquivalence: ReadonlySet<string> = new Set();
        if (framework === 'karate' && endpoint?.operation) {
          if (
            !task.contextFiles.some(
              (f) => f.ref.id === endpoint.ref.id && f.path === endpoint.path && f.bytes > 0,
            )
          )
            throw new AppError(
              422,
              'Read the selected endpoint contract before proposing API implementation',
            );
          const api = proposed.find((f) => f.path === apiPath);
          if (!api) throw new AppError(422, 'Proposal must include the selected API feature');
          validateKarate(api.content, contract.gherkin, apiPath, endpoint.operation);
          if (proposed.some((f) => f.path !== apiPath && f.path !== contract.featurePath))
            throw new AppError(
              422,
              'New API helpers require separate manual review; reuse existing indexed helpers',
            );
          const calls = [...api.content.matchAll(/call read\(['"]classpath:([^'"]+)['"]\)/g)];
          const inspectedHelpers = new Map<string, string>();
          for (const call of calls) {
            const path = 'api/src/test/resources/' + call[1];
            if (
              !reuse.some((r) => r.path === path) ||
              !task.contextFiles.some(
                (f) => f.ref.kind === 'target' && f.path === path && f.bytes > 0,
              )
            )
              throw new AppError(422, 'API helpers must be read and included in the reuse plan');
            inspectedHelpers.set(
              path,
              this.index.read({ kind: 'target', id: target.id }, path).text,
            );
          }
          schemaEquivalence = equivalentSchemaAssertions(
            currentText(target.path, apiPath),
            api.content,
            inspectedHelpers,
          );
          proposed.push({
            path: 'contracts/manifest.json',
            content: bindKarate(
              currentText(target.path, 'contracts/manifest.json')!,
              contract.gherkin,
              contract.featurePath,
              apiPath,
              endpoint,
            ),
          });
        }
        const files: FileChange[] = [];
        for (const f of proposed) {
          validateGeneratedFile(f.path, f.content);
          if (
            f.path.startsWith('contracts/') &&
            f.path !== contract.featurePath &&
            !(framework === 'karate' && f.path === 'contracts/manifest.json')
          )
            throw new AppError(403, 'Only the approved feature may change');
          const before = currentText(target.path, f.path);
          preserveExistingCapabilities(
            before,
            f.content,
            f.path,
            f.path === apiPath ? schemaEquivalence : undefined,
          );
          if (before !== null && f.path !== 'contracts/manifest.json' && clean(before) !== before)
            throw new AppError(
              422,
              'Redacted files require manual editing; no lossy automatic replacement',
            );
          if (before !== f.content)
            files.push({
              path: f.path,
              before,
              baseHash: before === null ? null : hash(before),
              after: f.content,
            });
        }
        const changedPaths = new Set(files.map((f) => f.path));
        const definitions = new Map<string, string>();
        const addDefinitions = (
          path: string,
          capabilities: ReturnType<typeof extractCapabilities>['capabilities'],
        ) => {
          for (const capability of capabilities.filter((c) =>
            ['page', 'component', 'step'].includes(c.kind),
          )) {
            const key = capability.kind + ':' + capability.name;
            if (definitions.has(key) && definitions.get(key) !== path)
              throw new AppError(
                422,
                'Duplicate existing automation capability: ' + capability.name,
              );
            definitions.set(key, path);
          }
        };
        for (const file of targetIndex.files)
          if (!changedPaths.has(file.path)) addDefinitions(file.path, file.capabilities);
        for (const file of files)
          if (!file.path.endsWith('.feature'))
            addDefinitions(file.path, extractCapabilities(file.after, file.path).capabilities);
        if (files.reduce((n, f) => n + Buffer.byteLength(f.after), 0) > 64000)
          throw new AppError(413, 'Generated change budget exceeded');
        const planned = list(p.files, 8).map((v) => text(v, 180));
        if (
          files.some(
            (f) =>
              f.path !== contract.featurePath &&
              f.path !== 'contracts/manifest.json' &&
              !planned.includes(f.path),
          )
        )
          throw new AppError(422, 'File change is absent from implementation plan');
        const change: ChangeProposal = {
          framework,
          ...(endpoint
            ? {
                apiEndpoint: {
                  ref: endpoint.ref,
                  path: endpoint.path,
                  symbol: endpoint.symbol,
                  hash: endpoint.hash,
                },
              }
            : {}),
          id: randomUUID(),
          taskId: task.id,
          contractId: contract.id,
          contractHash: contract.hash,
          targetId: target.id,
          targetRevision: contract.targetRevision,
          evidenceHash: contract.evidenceHash,
          plan: {
            summary: text(p.summary, 4000),
            reuse,
            files: [...new Set([...planned, ...files.map((f) => f.path), contract.featurePath])],
          },
          files,
          diff: makeDiff(files),
          hash: '',
          status: 'STAGED',
          createdAt: new Date().toISOString(),
        };
        change.hash = this.changeHash(change);
        this.repository.put('changes', change);
        task.changeId = change.id;
      },
      contract.id,
    );
  }
  private changeHash(change: ChangeProposal) {
    return hash(
      JSON.stringify({
        ...(change.framework ? { framework: change.framework } : {}),
        ...(change.apiEndpoint ? { apiEndpoint: change.apiEndpoint } : {}),
        contractId: change.contractId,
        targetId: change.targetId,
        contractHash: change.contractHash,
        targetRevision: change.targetRevision,
        files: change.files,
        diff: change.diff,
        plan: change.plan,
      }),
    );
  }
  private freshChange(id: string) {
    const change = this.repository.get('changes', id);
    if (this.changeHash(change) !== change.hash) throw new AppError(409, 'Change integrity failed');
    const contract = this.repository.get('contracts', change.contractId);
    if (
      contract.status !== 'APPROVED' ||
      contract.hash !== change.contractHash ||
      contract.approval?.hash !== contract.hash
    )
      throw new AppError(409, 'Contract approval is no longer current');
    const target = this.assertFresh(contract);
    this.dependenciesFresh(this.repository.get('tasks', contract.taskId));
    this.dependenciesFresh(this.repository.get('tasks', change.taskId));
    return { change, contract, target };
  }
  prepareValidation(id: string, expectedHash: string) {
    const { change, target } = this.freshChange(id);
    if (change.hash !== expectedHash || change.status !== 'STAGED')
      throw new AppError(409, 'Prepare the current staged proposal');
    const root = join(this.stagingRoot, change.id);
    if (existsSync(root)) {
      if (realpathSync(root) !== root) throw new AppError(403, 'Stage root changed');
      rmSync(root, { recursive: true });
    }
    buildStage(target, change, root);
    const staged = { ...target, path: root };
    this.workspace.features(staged);
    change.validationFingerprint = this.workspace.fingerprint(staged);
    this.repository.put('changes', change);
    return {
      fingerprint: change.validationFingerprint,
      diffHash: change.hash,
      warning:
        'Validation executes reviewed generated code and existing trusted dependencies with your OS permissions. It is not a sandbox. Target files remain unchanged until separate diff application approval.',
    };
  }
  validationTarget(id: string): Target {
    const { change, target } = this.freshChange(id);
    if (
      !change.validationFingerprint ||
      !['STAGED', 'VALIDATING', 'VALIDATED'].includes(change.status)
    )
      throw new AppError(403, 'Validation has not been prepared');
    const root = join(this.stagingRoot, change.id);
    if (realpathSync(root) !== root) throw new AppError(403, 'Stage root changed');
    const staged = { ...target, path: root, trustFingerprint: change.validationFingerprint };
    if (this.workspace.fingerprint(staged) !== change.validationFingerprint)
      throw new AppError(409, 'Staged executable changed; review again');
    return staged;
  }
  validate(
    id: string,
    input: { expectedHash: string; fingerprint: string; trustExecution: boolean; baseUrl: string },
  ) {
    const { change, contract } = this.freshChange(id);
    if (
      change.status !== 'STAGED' ||
      change.hash !== input.expectedHash ||
      change.validationFingerprint !== input.fingerprint ||
      !input.trustExecution
    )
      throw new AppError(403, 'Explicit trust of this reviewed stage is required');
    if (this.runner.busyTarget(change.targetId))
      throw new AppError(409, 'Target is already running');
    const target = this.validationTarget(id);
    const run = this.runner.create(
      {
        targetId: change.targetId,
        framework: change.framework || 'playwright',
        selection: { kind: 'feature', value: contract.featurePath },
        baseUrl: input.baseUrl,
        idempotencyKey: randomUUID(),
      },
      { proposalId: change.id, target },
    );
    change.status = 'VALIDATING';
    change.validationRunId = run.id;
    this.repository.put('changes', change);
    return run;
  }
  change(id: string) {
    const change = this.repository.get('changes', id);
    if (change.status === 'VALIDATING') {
      const run = change.validationRunId
        ? this.store.get('runs', change.validationRunId)
        : undefined;
      if (run && ['PASSED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status)) {
        change.status = run.status === 'PASSED' ? 'VALIDATED' : 'STAGED';
        change.error =
          run.status === 'PASSED'
            ? undefined
            : 'Validation ' + run.status + ': ' + (run.error || 'Inspect native results');
        this.repository.put('changes', change);
      }
    }
    return change;
  }
  apply(id: string, expectedHash: string) {
    this.change(id);
    const { change, contract, target } = this.freshChange(id);
    if (change.hash !== expectedHash || change.status !== 'VALIDATED')
      throw new AppError(403, 'Review and validate this exact diff before applying');
    if (this.runner.busyTarget(change.targetId))
      throw new AppError(409, 'Cannot modify a target during execution');
    const run = this.store.get('runs', change.validationRunId!);
    const feature = parseFeature(contract.gherkin, contract.featurePath);
    const expected = feature.scenarios.reduce((n, s) => n + (s.examples.length || 1), 0);
    if (
      !run ||
      run.status !== 'PASSED' ||
      run.framework !== (change.framework || 'playwright') ||
      run.proposalId !== change.id ||
      run.executableHash !== change.validationFingerprint ||
      run.tests.length !== expected ||
      run.tests.some(
        (t) => t.status !== 'PASSED' || !feature.scenarios.some((s) => s.id === t.scenarioId),
      )
    )
      throw new AppError(409, 'Complete scenario-linked native validation evidence is required');
    this.validationTarget(id);
    change.approval = { hash: change.hash, at: new Date().toISOString(), reviewer: 'local-user' };
    try {
      applyFiles(
        target.path,
        change,
        join(this.store.directory, 'generation', change.id + '.journal.json'),
      );
      change.status = 'APPLIED';
      change.appliedAt = new Date().toISOString();
    } catch (e) {
      change.status = 'APPLY_FAILED';
      change.error = e instanceof Error ? e.message : 'Apply failed';
      this.repository.put('changes', change);
      throw e;
    }
    const saved = this.repository.put('changes', change);
    try {
      this.onApplied?.(saved);
    } catch {
      /* Advisory knowledge cannot alter application evidence. */
    }
    return saved;
  }
  rejectChange(id: string, expectedHash: string) {
    const change = this.change(id);
    if (change.hash !== expectedHash || ['APPLIED', 'APPLY_FAILED'].includes(change.status))
      throw new AppError(409, 'Proposal cannot be rejected');
    if (change.status === 'VALIDATING')
      throw new AppError(409, 'Cancel validation in Runs before rejecting');
    change.status = 'REJECTED';
    return this.repository.put('changes', change);
  }
  cancel(id: string) {
    const task = this.repository.get('tasks', id);
    if (this.active?.id !== id) return task;
    task.status = 'CANCEL_REQUESTED';
    this.repository.put('tasks', task);
    this.active.abort.abort();
    return task;
  }
  async shutdown() {
    await Promise.allSettled([...this.connections].map((connection) => connection.close()));
    if (this.active) {
      this.active.abort.abort();
      await this.active.done;
    }
  }
}
