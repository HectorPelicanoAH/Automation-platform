import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { Empty, Status, short } from './ui.tsx';
import type { Source, Target } from '../../../packages/domain/model.ts';
import type {
  AiSettings,
  GenerationTask,
  ContractProposal,
  ChangeProposal,
} from '../../../packages/generation/model.ts';
import type { IndexSummary, RootRef } from '../../../packages/intelligence/index.ts';
import type { Recording, EvidenceEvent } from '../../../packages/recording/model.ts';
interface GenerationState {
  settings: AiSettings;
  codexHome: string;
  tasks: Pick<
    GenerationTask,
    'id' | 'kind' | 'status' | 'targetId' | 'createdAt' | 'contractId' | 'changeId' | 'error'
  >[];
  contracts: Pick<ContractProposal, 'id' | 'targetId' | 'recordingId' | 'featurePath' | 'status'>[];
  changes: Pick<
    ChangeProposal,
    'id' | 'targetId' | 'contractId' | 'status' | 'validationRunId' | 'error'
  >[];
}
interface ConnectionInfo {
  account: { account: unknown };
  catalog: { data: { model: string; displayName: string; isDefault: boolean }[] };
}
interface Lookup {
  matches: {
    path: string;
    hash: string;
    stale: boolean;
    capabilities: { kind: string; name: string; line: number }[];
  }[];
}
const running = (status: string) => ['RUNNING', 'CANCEL_REQUESTED'].includes(status);
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function GenerationPanel({
  visible,
  targetId,
  sources,
  targets,
  baseUrl,
  onRun,
}: {
  visible: boolean;
  targetId: string;
  sources: Source[];
  targets: Target[];
  baseUrl: string;
  onRun: (id: string) => void;
}) {
  const [state, setState] = useState<GenerationState>();
  const [records, setRecords] = useState<Recording[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [binary, setBinary] = useState('');
  const [trustCli, setTrustCli] = useState(false);
  const [info, setInfo] = useState<ConnectionInfo>();
  const [analysisModel, setAnalysisModel] = useState('');
  const [implementationModel, setImplementationModel] = useState('');
  const [analysisEffort, setAnalysisEffort] = useState('medium');
  const [implementationEffort, setImplementationEffort] = useState('medium');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [indexes, setIndexes] = useState<IndexSummary[]>([]);
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<Lookup>();
  const [recordingId, setRecordingId] = useState('');
  const [featurePath, setFeaturePath] = useState('contracts/features/promotions.feature');
  const [taskId, setTaskId] = useState('');
  const [task, setTask] = useState<GenerationTask>();
  const [contractId, setContractId] = useState('');
  const [contract, storeContract] = useState<ContractProposal>();
  const [gherkin, setGherkin] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const edits = useRef(0);
  const [changeId, setChangeId] = useState('');
  const [change, storeChange] = useState<ChangeProposal>();
  const [trustStage, setTrustStage] = useState(false);
  const [approveDiff, setApproveDiff] = useState(false);
  const [validationUrl, setValidationUrl] = useState(baseUrl);
  const [evidence, setEvidence] = useState<unknown>();
  const revision = useRef(0);
  const initialized = useRef(false);
  const selection = useRef({ targetId, contractId, changeId, dirty });
  selection.current = { targetId, contractId, changeId, dirty };
  const setContract = (next: ContractProposal | undefined) => {
    if (
      next &&
      (next.id !== selection.current.contractId || next.targetId !== selection.current.targetId)
    )
      return;
    storeContract(next);
  };
  const setChange = (next: ChangeProposal | undefined) => {
    if (
      next &&
      (next.id !== selection.current.changeId || next.targetId !== selection.current.targetId)
    )
      return;
    storeChange(next);
  };
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const next = await api<GenerationState>('/generation/state');
    const list = await api<{ recordings: Recording[] }>('/recordings');
    if (request !== revision.current) return;
    setState(next);
    setRecords(list.recordings);
    if (!initialized.current) {
      setBinary(next.settings.binary);
      setAnalysisModel(next.settings.analysisModel);
      setImplementationModel(next.settings.implementationModel);
      setAnalysisEffort(next.settings.analysisEffort);
      setImplementationEffort(next.settings.implementationEffort);
      initialized.current = true;
    }
  }, []);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!visible) return;
    let stopped = false,
      inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await refresh();
      } catch (e) {
        if (!stopped) setError(String(e));
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visible, refresh]);
  useEffect(() => {
    setTaskId('');
    setTask(undefined);
    setContractId('');
    setContract(undefined);
    setChangeId('');
    setChange(undefined);
    setLookup(undefined);
    setDirty(false);
    setEvidence(undefined);
  }, [targetId]);
  useEffect(() => {
    if (!visible || !taskId) return;
    let stopped = false,
      terminal = false,
      inFlight = false;
    const load = async () => {
      if (inFlight || terminal) return;
      inFlight = true;
      try {
        const next = await api<GenerationTask>('/generation/tasks/' + taskId);
        if (stopped) return;
        setTask(next);
        terminal = !running(next.status);
        if (next.status === 'SUCCEEDED') {
          if (
            next.contractId &&
            (!selection.current.dirty || next.contractId === selection.current.contractId)
          )
            setContractId(next.contractId);
          if (next.changeId) setChangeId(next.changeId);
        }
      } catch (e) {
        if (!stopped) setError(String(e));
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visible, taskId]);
  useEffect(() => {
    if (!contractId) {
      setContract(undefined);
      return;
    }
    let stopped = false;
    void api<ContractProposal>('/generation/contracts/' + contractId)
      .then((c) => {
        if (
          stopped ||
          selection.current.contractId !== c.id ||
          selection.current.targetId !== c.targetId
        )
          return;
        setContract(c);
        setGherkin(c.gherkin);
        setAnswers(Object.fromEntries(c.answers.map((a) => [a.id, a.text])));
        setDirty(false);
        edits.current = 0;
        setEvidence(undefined);
      })
      .catch((e) => {
        if (!stopped) setError(String(e));
      });
    return () => {
      stopped = true;
    };
  }, [contractId]);
  useEffect(() => {
    if (!visible || !changeId) {
      if (!changeId) setChange(undefined);
      return;
    }
    let stopped = false,
      inFlight = false,
      terminal = false;
    setTrustStage(false);
    setApproveDiff(false);
    const load = async () => {
      if (inFlight || terminal) return;
      inFlight = true;
      try {
        const c = await api<ChangeProposal>('/generation/changes/' + changeId);
        if (stopped) return;
        setChange(c);
        terminal = c.status !== 'VALIDATING';
      } catch (e) {
        if (!stopped) setError(String(e));
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visible, changeId, change?.status]);
  const selectedTarget = targets.find((t) => t.id === targetId);
  const refs: RootRef[] = [
    ...(targetId ? [{ kind: 'target' as const, id: targetId }] : []),
    ...sourceIds.map((id) => ({ kind: 'source' as const, id })),
  ];
  const review = async (approve: boolean) => {
    if (!contract) return;
    const version = edits.current;
    const next = await api<ContractProposal>('/generation/contracts/' + contract.id + '/review', {
      expectedHash: contract.hash,
      gherkin,
      answers: contract.questions.map((q) => ({ id: q.id, text: answers[q.id] || '' })),
      approve,
    });
    if (selection.current.contractId !== next.id || selection.current.targetId !== next.targetId)
      return;
    setContract(next);
    if (edits.current === version) {
      setDirty(false);
      setGherkin(next.gherkin);
    }
    setNotice(
      approve
        ? 'This exact contract revision is approved.'
        : 'Draft saved; implementation approval is invalidated.',
    );
  };
  const inspectEvidence = async (reference: string) => {
    if (!contract) return;
    const [kind, value] = reference.split(':');
    const data = await api<{ recording: Recording; events: EvidenceEvent[] }>(
      '/recordings/' + contract.recordingId + '?after=' + Math.max(0, Number(value) - 1),
    );
    setEvidence(
      kind === 'event'
        ? data.events.find((e) => e.sequence === Number(value))
        : data.recording.transcript.at(-1)?.segments[Number(value)],
    );
  };
  return (
    <div hidden={!visible} className="generation-workbench">
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          {notice}
        </div>
      )}
      <section className="panel">
        <details open={!state?.settings.enabled}>
          <summary>
            <b>AI configuration</b> · {state?.settings.enabled ? 'enabled' : 'disabled'}
          </summary>
          <p className="muted">
            Codex runs with isolated configuration and application-owned tools. Only selected,
            bounded evidence/context is sent to the configured provider. It may consume your account
            quota. Manual scenarios and runs remain available.
          </p>
          <div className="form-grid">
            <label>
              Codex executable
              <input
                value={binary}
                onChange={(e) => {
                  setBinary(e.target.value);
                  setTrustCli(false);
                  setInfo(undefined);
                }}
                placeholder="/absolute/path/to/codex"
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={trustCli}
                onChange={(e) => setTrustCli(e.target.checked)}
              />
              I trust this Codex executable
            </label>
          </div>
          <div className="button-row">
            <button
              disabled={busy || !trustCli || !binary}
              onClick={() =>
                void act(async () => {
                  await api('/generation/cli', { binary, trustExecution: trustCli });
                  setInfo(undefined);
                  setNotice(
                    'CLI version and fingerprint verified. AI remains disabled until configured.',
                  );
                })
              }
            >
              Verify Codex CLI
            </button>
            <button
              className="secondary"
              disabled={busy || !state?.settings.binary}
              onClick={() =>
                void act(async () => {
                  const result = await api<ConnectionInfo>('/generation/connection', {});
                  setInfo(result);
                  const fallback =
                    result.catalog.data.find((m) => m.isDefault)?.model ||
                    result.catalog.data[0]?.model ||
                    '';
                  setAnalysisModel((current) => current || fallback);
                  setImplementationModel((current) => current || fallback);
                })
              }
            >
              Check authentication and models
            </button>
          </div>
          {state?.codexHome && (
            <p className="muted">
              Authenticate separately in the isolated home, outside model context:{' '}
              <code>
                {'CODEX_HOME=' +
                  quote(state.codexHome) +
                  ' ' +
                  quote(state.settings.binary || binary || '/path/to/codex') +
                  ' login'}
              </code>
            </p>
          )}
          {info && (
            <p role="status">
              {info.account.account
                ? 'Authenticated account detected. Inference entitlement is verified only by a successful turn.'
                : 'Not authenticated. Complete the isolated CLI login before generating.'}
            </p>
          )}
          <div className="form-grid">
            {(['Analysis', 'Implementation'] as const).map((kind) => (
              <React.Fragment key={kind}>
                <label>
                  {kind} model
                  <input
                    list="codex-models"
                    value={kind === 'Analysis' ? analysisModel : implementationModel}
                    onChange={(e) =>
                      (kind === 'Analysis' ? setAnalysisModel : setImplementationModel)(
                        e.target.value,
                      )
                    }
                  />
                </label>
                <label>
                  {kind} reasoning
                  <select
                    value={kind === 'Analysis' ? analysisEffort : implementationEffort}
                    onChange={(e) =>
                      (kind === 'Analysis' ? setAnalysisEffort : setImplementationEffort)(
                        e.target.value,
                      )
                    }
                  >
                    {['low', 'medium', 'high', 'xhigh'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </React.Fragment>
            ))}
          </div>
          <datalist id="codex-models">
            {info?.catalog.data.map((m) => (
              <option value={m.model} key={m.model}>
                {m.displayName}
              </option>
            ))}
          </datalist>
          <div className="button-row">
            <button
              disabled={busy || !trustCli || !analysisModel || !implementationModel}
              onClick={() =>
                void act(async () => {
                  await api('/generation/settings', {
                    enabled: true,
                    binary,
                    analysisModel,
                    implementationModel,
                    analysisEffort,
                    implementationEffort,
                    trustExecution: trustCli,
                  });
                  setNotice(
                    'AI configuration saved. Tasks start only through explicit workflow actions.',
                  );
                })
              }
            >
              Enable configured AI
            </button>
            <button
              className="secondary"
              disabled={busy || !state?.settings.enabled}
              onClick={() =>
                void act(async () => {
                  await api('/generation/settings', {
                    enabled: false,
                    binary,
                    analysisModel,
                    implementationModel,
                    analysisEffort,
                    implementationEffort,
                    trustExecution: false,
                  });
                })
              }
            >
              Disable AI
            </button>
          </div>
        </details>
      </section>
      {!selectedTarget ? (
        <Empty title="Choose an automation target">
          Connect or select a separate automation repository in Workspace.
        </Empty>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">REPOSITORY CONTEXT</p>
                <h2>Discover before generating</h2>
              </div>
            </div>
            <p className="muted">
              Target: {selectedTarget.name}. Source indexing requires opt-in in Workspace. Syntax
              facts are incomplete for dynamic behavior; no repository scripts are executed.
            </p>
            <div className="source-choices">
              {sources.map((source) => (
                <label className="checkbox-label" key={source.id}>
                  <input
                    type="checkbox"
                    disabled={!source.enabled || !source.indexEnabled}
                    checked={sourceIds.includes(source.id)}
                    onChange={(e) =>
                      setSourceIds((ids) =>
                        e.target.checked
                          ? [...ids, source.id]
                          : ids.filter((id) => id !== source.id),
                      )
                    }
                  />
                  {source.name}
                  {!source.indexEnabled ? ' · indexing disabled' : ''}
                </label>
              ))}
            </div>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const results = [];
                  for (const ref of refs)
                    results.push(await api<IndexSummary>('/intelligence/scan', ref));
                  setIndexes(results);
                })
              }
            >
              Index selected repositories
            </button>
            {indexes.map((index) => (
              <p key={index.ref.kind + index.ref.id} className="muted">
                {index.ref.kind} {short(index.ref.id)} · {index.parsed} parsed / {index.reused}{' '}
                reused / {index.skipped} skipped ·{' '}
                {index.truncated ? 'TRUNCATED' : 'bounded scan complete'} · {index.warningCount}{' '}
                extraction warnings · HEAD {index.revision?.slice(0, 12) || 'non-Git'} / working
                tree {index.treeHash.slice(0, 12)}
                {index.preferredRef ? ' · requested ' + index.preferredRef : ''}
              </p>
            ))}
            <div className="form-grid">
              <label>
                Capability search
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="promotions guest customer"
                />
              </label>
              <button
                className="secondary"
                disabled={busy || !query}
                onClick={() =>
                  void act(async () => {
                    setLookup(
                      await api<Lookup>('/intelligence/lookup', {
                        kind: 'target',
                        id: targetId,
                        query,
                      }),
                    );
                  })
                }
              >
                Search target capabilities
              </button>
            </div>
            {lookup && (
              <div className="capability-results">
                {lookup.matches.length === 0 ? (
                  <p>No matching indexed capability.</p>
                ) : (
                  lookup.matches.map((hit) => (
                    <details key={hit.path}>
                      <summary>
                        {hit.path} · {hit.stale ? 'STALE' : 'current hash checked'}
                      </summary>
                      <ul>
                        {hit.capabilities.map((c, i) => (
                          <li key={i}>
                            {c.kind}: {c.name} · line {c.line}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <p className="eyebrow">1 · RECORDING TO CONTRACT</p>
            <h2>Propose business scenarios</h2>
            <p className="muted">
              Observed interactions, narrated requirements and inferred questions remain distinct.
              No target files change during analysis.
            </p>
            <div className="form-grid">
              <label>
                Source recording
                <select value={recordingId} onChange={(e) => setRecordingId(e.target.value)}>
                  <option value="">Choose a stopped recording</option>
                  {records
                    .filter((r) => !['STARTING', 'RECORDING', 'STOPPING'].includes(r.status))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.status}
                        {r.incomplete ? ' · incomplete' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Feature destination
                <input value={featurePath} onChange={(e) => setFeaturePath(e.target.value)} />
              </label>
            </div>
            <button
              disabled={
                busy ||
                !state?.settings.enabled ||
                !recordingId ||
                state.tasks.some((t) => running(t.status))
              }
              onClick={() =>
                void act(async () => {
                  const next = await api<GenerationTask>('/generation/analyze', {
                    targetId,
                    recordingId,
                    featurePath,
                    sourceIds,
                  });
                  setTaskId(next.id);
                  setTask(next);
                })
              }
            >
              Analyze recording
            </button>
          </section>
          <section className="panel">
            <h2>Agent tasks</h2>
            <label>
              Task history
              <select
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  setTask(undefined);
                }}
              >
                <option value="">Choose a task</option>
                {state?.tasks
                  .filter((t) => t.targetId === targetId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.kind} · {t.status} · {short(t.id)}
                    </option>
                  ))}
              </select>
            </label>
            {task && task.id === taskId && task.targetId === targetId && (
              <>
                <p>
                  <Status value={task.status} /> {task.model} · {task.toolCalls} tool calls ·{' '}
                  {task.retrievalBytes} context bytes
                </p>
                {task.error && <p role="alert">{task.error}</p>}
                {running(task.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api('/generation/tasks/' + task.id + '/cancel', {});
                      })
                    }
                  >
                    Cancel AI task
                  </button>
                )}
                <div className="agent-progress" aria-live="polite">
                  {task.events.map((event, i) => (
                    <p key={i}>
                      <b>{event.kind}</b> · {event.text}
                    </p>
                  ))}
                </div>
                <details>
                  <summary>Retrieved file provenance and usage</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        files: task.contextFiles,
                        usage: task.usage,
                        inputTokenProxy: task.usage
                          ? undefined
                          : {
                              estimate: Math.ceil((task.promptBytes + task.retrievalBytes) / 4),
                              method:
                                '(initial prompt bytes + retrieved text bytes) / 4; excludes protocol/history overhead; not billing tokens',
                            },
                        usageStatus: task.usage
                          ? 'provider reported'
                          : 'not reported; no token savings claimed',
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
          </section>
          <section className="panel">
            <p className="eyebrow">2 · HUMAN REQUIREMENT REVIEW</p>
            <h2>Review the functional contract</h2>
            <label>
              Contract proposal
              <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">Choose a proposal</option>
                {state?.contracts
                  .filter((c) => c.targetId === targetId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.featurePath} · {c.status} · {short(c.id)}
                    </option>
                  ))}
              </select>
            </label>
            {contract && contract.id === contractId && contract.targetId === targetId && (
              <>
                <p>
                  <Status value={contract.status} />{' '}
                  {dirty
                    ? 'Unsaved edits · implementation disabled'
                    : 'Revision ' + contract.hash.slice(0, 12)}
                </p>
                <details>
                  <summary>Claims and recording evidence</summary>
                  {contract.claims.map((claim, i) => (
                    <div key={i}>
                      <p>
                        <b>{claim.provenance}</b> · {claim.text}
                      </p>
                      {claim.evidenceIds.map((ref) => (
                        <button
                          className="secondary"
                          key={ref}
                          onClick={() => void act(() => inspectEvidence(ref))}
                        >
                          Inspect {ref}
                        </button>
                      ))}
                    </div>
                  ))}
                  {evidence !== undefined && <pre>{JSON.stringify(evidence, null, 2)}</pre>}
                </details>
                <label>
                  Proposed Gherkin
                  <textarea
                    className="code-editor"
                    rows={16}
                    value={gherkin}
                    onChange={(e) => {
                      setGherkin(e.target.value);
                      edits.current++;
                      setDirty(true);
                    }}
                  />
                </label>
                {contract.questions.map((q) => (
                  <label key={q.id}>
                    {q.text}
                    <textarea
                      rows={2}
                      value={answers[q.id] || ''}
                      onChange={(e) => {
                        setAnswers((a) => ({ ...a, [q.id]: e.target.value }));
                        edits.current++;
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy || contract.status === 'REJECTED'}
                    onClick={() => void act(() => review(false))}
                  >
                    Save contract draft
                  </button>
                  <button
                    disabled={
                      busy ||
                      contract.status === 'REJECTED' ||
                      contract.questions.some((q) => !answers[q.id]?.trim())
                    }
                    onClick={() => void act(() => review(true))}
                  >
                    Approve this Gherkin revision
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || contract.status === 'REJECTED'}
                    onClick={() =>
                      void act(async () => {
                        setContract(
                          await api<ContractProposal>(
                            '/generation/contracts/' + contract.id + '/reject',
                            {},
                          ),
                        );
                      })
                    }
                  >
                    Reject contract
                  </button>
                </div>
                <button
                  disabled={
                    busy ||
                    dirty ||
                    contract.status !== 'APPROVED' ||
                    !state?.settings.enabled ||
                    state.tasks.some((t) => running(t.status))
                  }
                  onClick={() =>
                    void act(async () => {
                      const next = await api<GenerationTask>(
                        '/generation/contracts/' + contract.id + '/implement',
                        { expectedHash: contract.hash },
                      );
                      setTaskId(next.id);
                      setTask(next);
                    })
                  }
                >
                  Plan and generate Playwright changes
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <p className="eyebrow">3 · REVIEW, VALIDATE, APPLY</p>
            <h2>Inspect proposed implementation</h2>
            <label>
              Change proposal
              <select value={changeId} onChange={(e) => setChangeId(e.target.value)}>
                <option value="">Choose a diff</option>
                {state?.changes
                  .filter((c) => c.targetId === targetId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.status} · {short(c.id)}
                    </option>
                  ))}
              </select>
            </label>
            {change && change.id === changeId && change.targetId === targetId && (
              <>
                <p>
                  <Status value={change.status} /> Diff {change.hash.slice(0, 12)}
                </p>
                <p>{change.plan.summary}</p>
                <p className="muted">
                  Contract revision {change.contractHash.slice(0, 12)} ·{' '}
                  <button className="secondary" onClick={() => setContractId(change.contractId)}>
                    View associated contract
                  </button>
                  {dirty && ' Save or discard contract edits before applying a diff.'}
                </p>
                <ul>
                  {change.plan.reuse.map((r, i) => (
                    <li key={i}>
                      Reuse {r.path} · {r.symbol}
                    </li>
                  ))}
                </ul>
                <pre className="generated-diff">
                  {change.diff ||
                    'No file changes proposed; existing capabilities cover the approved contract.'}
                </pre>
                {change.error && <p role="alert">{change.error}</p>}
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy || change.status !== 'STAGED'}
                    onClick={() =>
                      void act(async () => {
                        await api('/generation/changes/' + change.id + '/prepare', {
                          expectedHash: change.hash,
                        });
                        setChange(await api<ChangeProposal>('/generation/changes/' + change.id));
                        setTrustStage(false);
                      })
                    }
                  >
                    Prepare private validation
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !['STAGED', 'VALIDATED'].includes(change.status)}
                    onClick={() =>
                      void act(async () => {
                        setChange(
                          await api<ChangeProposal>(
                            '/generation/changes/' + change.id + '/reject',
                            { expectedHash: change.hash },
                          ),
                        );
                      })
                    }
                  >
                    Reject proposed diff
                  </button>
                </div>
                {change.validationFingerprint && change.status === 'STAGED' && (
                  <>
                    <p className="muted">
                      Validation executes reviewed generated code and existing target dependencies
                      with your OS permissions. It is not a security sandbox. Execution trust is
                      separate from applying the diff.
                    </p>
                    <label>
                      Validation application URL
                      <input
                        value={validationUrl}
                        onChange={(e) => {
                          setValidationUrl(e.target.value);
                          setTrustStage(false);
                        }}
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={trustStage}
                        onChange={(e) => setTrustStage(e.target.checked)}
                      />
                      I trust this staged code and dependencies for execution
                    </label>
                    <button
                      disabled={busy || !trustStage}
                      onClick={() =>
                        void act(async () => {
                          const run = await api<{ id: string }>(
                            '/generation/changes/' + change.id + '/validate',
                            {
                              expectedHash: change.hash,
                              fingerprint: change.validationFingerprint,
                              trustExecution: trustStage,
                              baseUrl: validationUrl,
                            },
                          );
                          setChange({ ...change, status: 'VALIDATING', validationRunId: run.id });
                          setTrustStage(false);
                        })
                      }
                    >
                      Run staged Playwright validation
                    </button>
                  </>
                )}
                {change.validationRunId && (
                  <button className="secondary" onClick={() => onRun(change.validationRunId!)}>
                    Inspect validation run
                  </button>
                )}
                {change.status === 'VALIDATING' && (
                  <p role="status">
                    Native validation is running. Cancel it or inspect artifacts in Runs.
                  </p>
                )}
                {change.status === 'VALIDATED' && (
                  <>
                    <p>
                      Native validation passed. The managed target still awaits your exact diff
                      approval.
                    </p>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={approveDiff}
                        onChange={(e) => setApproveDiff(e.target.checked)}
                      />
                      I approve applying this exact diff to {selectedTarget.name}
                    </label>
                    <button
                      disabled={
                        busy ||
                        !approveDiff ||
                        dirty ||
                        contract?.id !== change.contractId ||
                        contract?.hash !== change.contractHash ||
                        contract?.status !== 'APPROVED'
                      }
                      onClick={() =>
                        void act(async () => {
                          setChange(
                            await api<ChangeProposal>(
                              '/generation/changes/' + change.id + '/apply',
                              { expectedHash: change.hash },
                            ),
                          );
                          setApproveDiff(false);
                          setNotice(
                            'Reviewed diff applied. Trust the updated executable fingerprint before a managed run.',
                          );
                        })
                      }
                    >
                      Apply approved diff
                    </button>
                  </>
                )}
                {change.status === 'APPLIED' && (
                  <p role="status">
                    Approved changes applied; journal retained. Review the target and run it
                    independently.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
