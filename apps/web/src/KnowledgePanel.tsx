import React, { useEffect, useState } from 'react';
import { api } from './api.ts';
import { Empty, Status, short } from './ui.tsx';
import type {
  Knowledge,
  KnowledgeDocument,
  KnowledgeClass,
  SkillBundle,
  SkillEvaluation,
  SkillChange,
  ActiveSkill,
} from '../../../packages/evolution/model.ts';
import type { EvolutionJob } from '../../../packages/evolution/manager.ts';
import type { workflowMetrics } from '../../../packages/evolution/metrics.ts';
import type { HealthRun } from '../../../packages/health/model.ts';
interface EvolutionState {
  records: Knowledge[];
  bundles: SkillBundle[];
  evaluations: SkillEvaluation[];
  active: ActiveSkill[];
  changes: SkillChange[];
  jobs: EvolutionJob[];
  metrics: ReturnType<typeof workflowMetrics>;
}
export function KnowledgePanel({ targetId }: { targetId: string }) {
  const [state, setState] = useState<EvolutionState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordId, setRecordId] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [change, setChange] = useState<SkillChange>();
  const [job, setJob] = useState<EvolutionJob>();
  const [document, setDocument] = useState<{
    document: KnowledgeDocument | null;
    history: KnowledgeDocument[];
    fresh: boolean;
  }>();
  const [restoreHash, setRestoreHash] = useState('');
  const [restoreApproval, setRestoreApproval] = useState(false);
  const [trust, setTrust] = useState(false);
  const [approve, setApprove] = useState(false);
  const [rollback, setRollback] = useState(false);
  const [exported, setExported] = useState<unknown>();
  const [claim, setClaim] = useState('');
  const [classification, setClassification] = useState<KnowledgeClass>('PROCEDURE');
  const [provenance, setProvenance] = useState<'OBSERVED' | 'INFERRED'>('INFERRED');
  const [importText, setImportText] = useState('');
  const load = async () => {
    const s = await api<EvolutionState>(
      `/evolution/state${targetId ? '?targetId=' + encodeURIComponent(targetId) : ''}`,
    );
    setState(s);
    setRecordId((id) => (s.records.some((k) => k.id === id) ? id : s.records[0]?.id || ''));
    setBundleId((id) => (s.bundles.some((b) => b.id === id) ? id : s.bundles[0]?.id || ''));
  };
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let stopped = false;
    void api<EvolutionState>(
      `/evolution/state${targetId ? '?targetId=' + encodeURIComponent(targetId) : ''}`,
    )
      .then((s) => {
        if (!stopped) {
          setState(s);
          setRecordId(s.records[0]?.id || '');
          setBundleId(s.bundles[0]?.id || '');
        }
      })
      .catch((e) => {
        if (!stopped) setError(String(e));
      });
    return () => {
      stopped = true;
    };
  }, [targetId]);
  useEffect(() => {
    if (!job || !['RUNNING', 'CANCEL_REQUESTED'].includes(job.status)) return;
    let stopped = false;
    const timer = setInterval(() => {
      void api<EvolutionJob>(`/evolution/jobs/${job.id}`)
        .then(async (j) => {
          if (stopped) return;
          setJob(j);
          if (!['RUNNING', 'CANCEL_REQUESTED'].includes(j.status)) await load();
        })
        .catch((e) => {
          if (!stopped) setError(String(e));
        });
    }, 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  useEffect(() => {
    setDocument(undefined);
    setRestoreHash('');
    setRestoreApproval(false);
    if (!recordId) return;
    const abort = new AbortController();
    void api<{ document: KnowledgeDocument | null; history: KnowledgeDocument[]; fresh: boolean }>(
      `/evolution/knowledge/${recordId}/document`,
      undefined,
      'GET',
      abort.signal,
    )
      .then(setDocument)
      .catch((e) => {
        if (!abort.signal.aborted) setError(String(e));
      });
    return () => abort.abort();
  }, [recordId, state]);
  const record = state?.records.find((k) => k.id === recordId),
    version = record?.versions.find((v) => v.hash === record.currentHash),
    bundle = state?.bundles.find((b) => b.id === bundleId);
  const active = state?.active.find((a) => a.name === bundle?.name),
    evaluation = state?.evaluations.find(
      (e) => e.bundleId === bundleId && e.bundleHash === bundle?.hash && e.status === 'PASSED',
    );
  const running = job && ['RUNNING', 'CANCEL_REQUESTED'].includes(job.status);
  const refresh = () => work(load);
  return (
    <div className="generation-workbench evolution-workbench">
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Repository knowledge</h2>
          <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh knowledge
          </button>
        </div>
        <p>
          Source-backed advisory facts. Candidate, inferred and stale observations do not become
          instructions or requirements automatically.
        </p>
        {!targetId ? (
          <Empty title="Select an automation target">
            Knowledge stays scoped to registered repository evidence.
          </Empty>
        ) : (
          <button
            className="button"
            disabled={busy || !!running}
            onClick={() =>
              void work(async () => setJob(await api('/evolution/collect', { targetId })))
            }
          >
            Collect current workflow knowledge
          </button>
        )}
        {!state ? (
          <p>Loading knowledge…</p>
        ) : !state.records.length ? (
          <p className="muted">
            No discoveries yet. Completed target executions also queue bounded automatic collection.
          </p>
        ) : (
          <>
            <label>
              Knowledge record
              <select value={recordId} onChange={(e) => setRecordId(e.target.value)}>
                {state.records.map((k) => (
                  <option value={k.id} key={k.id}>
                    {k.status} ·{' '}
                    {k.versions.find((v) => v.hash === k.currentHash)?.claim.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            {record && version && (
              <>
                <Status value={record.status} />
                <p>{version.claim}</p>
                <p>
                  {version.classification} · {version.confidence} · {version.provenance} ·{' '}
                  {record.versions.length} version(s)
                </p>
                <code>{version.hash}</code>
                <details>
                  <summary>Sources, revisions and workflow evidence</summary>
                  <pre>{JSON.stringify(version, null, 2)}</pre>
                </details>
                <div className="button-row">
                  <button
                    className="button"
                    disabled={
                      busy ||
                      record.status === 'STALE' ||
                      version.classification === 'TEMPORARY' ||
                      version.provenance === 'INFERRED'
                    }
                    onClick={() =>
                      void work(async () => {
                        await api(`/evolution/knowledge/${record.id}/review`, {
                          expectedHash: version.hash,
                          approve: true,
                        });
                        await load();
                      })
                    }
                  >
                    Approve fact and publish concise documentation
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        await api(`/evolution/knowledge/${record.id}/review`, {
                          expectedHash: version.hash,
                          approve: false,
                        });
                        await load();
                      })
                    }
                  >
                    Reject knowledge candidate
                  </button>
                </div>
                {version.provenance === 'INFERRED' && (
                  <p>
                    Inferred claims are not automatically promoted. Verify actual sources and
                    propose an explicitly observed replacement before approval.
                  </p>
                )}
                {document?.document && (
                  <>
                    <h3>
                      Private documentation <Status value={document.fresh ? 'CURRENT' : 'STALE'} />
                    </h3>
                    <pre aria-label="Knowledge documentation">{document.document.text}</pre>
                    <code>{document.document.hash}</code>
                    {document.history.length > 1 && (
                      <>
                        <label>
                          Prior documentation version
                          <select
                            value={restoreHash}
                            onChange={(e) => {
                              setRestoreHash(e.target.value);
                              setRestoreApproval(false);
                            }}
                          >
                            <option value="">Select a version</option>
                            {document.history
                              .filter((d) => d.hash !== document.document!.hash)
                              .map((d) => (
                                <option value={d.hash} key={d.id}>
                                  {short(d.hash)} · {d.createdAt}
                                </option>
                              ))}
                          </select>
                        </label>
                        {restoreHash && (
                          <pre>{document.history.find((d) => d.hash === restoreHash)?.text}</pre>
                        )}
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={restoreApproval}
                            onChange={(e) => setRestoreApproval(e.target.checked)}
                          />
                          I approve restoring this exact private documentation version
                        </label>
                        <button
                          className="button secondary"
                          disabled={busy || !restoreHash || !restoreApproval}
                          onClick={() =>
                            void work(async () => {
                              await api(`/evolution/knowledge/${record.id}/restore-document`, {
                                currentHash: document.document!.hash,
                                restoreHash,
                              });
                              await load();
                              setRestoreApproval(false);
                            })
                          }
                        >
                          Restore reviewed documentation
                        </button>
                      </>
                    )}
                  </>
                )}
                <details>
                  <summary>Propose a classified observation from this evidence</summary>
                  <label>
                    Discovery classification
                    <select
                      value={classification}
                      onChange={(e) => setClassification(e.target.value as KnowledgeClass)}
                    >
                      {[
                        'TEMPORARY',
                        'REPOSITORY',
                        'PROCEDURE',
                        'DECISION',
                        'SKILL_IMPROVEMENT',
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Concise sourced claim
                    <textarea
                      maxLength={1000}
                      value={claim}
                      onChange={(e) => setClaim(e.target.value)}
                    />
                  </label>
                  <label>
                    Observation provenance
                    <select
                      value={provenance}
                      onChange={(e) => setProvenance(e.target.value as typeof provenance)}
                    >
                      <option>INFERRED</option>
                      <option>OBSERVED</option>
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy || !claim.trim()}
                    onClick={() =>
                      void work(async () => {
                        const k = await api<Knowledge>('/evolution/knowledge/propose', {
                          sourceRecordId: record.id,
                          expectedHash: version.hash,
                          classification,
                          claim,
                          provenance,
                        });
                        await load();
                        setRecordId(k.id);
                        setClaim('');
                      })
                    }
                  >
                    Save observation candidate
                  </button>
                </details>
              </>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Knowledge &amp; Skills — versioned procedures</h2>
        <p>
          Bundles remain inactive until the exact evaluated diff is explicitly approved.
          External/global skills are never overwritten by this workflow.
        </p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              const b = await api<SkillBundle>('/evolution/skills/baseline', {});
              await load();
              setBundleId(b.id);
              setChange(undefined);
              setTrust(false);
            })
          }
        >
          Propose portable summary baseline
        </button>
        {state?.bundles.length ? (
          <>
            <label>
              Skill bundle
              <select
                value={bundleId}
                onChange={(e) => {
                  setBundleId(e.target.value);
                  setTrust(false);
                  setChange(undefined);
                  setApprove(false);
                  setExported(undefined);
                }}
              >
                {state.bundles.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name} · {b.version} · {b.status} · {short(b.hash)}
                  </option>
                ))}
              </select>
            </label>
            {bundle && (
              <>
                <Status value={bundle.status} />
                <p>
                  <b>Observed problem:</b> {bundle.problem}
                </p>
                <p>
                  <b>Expected benefit:</b> {bundle.benefit}
                </p>
                <code>Bundle SHA-256 {bundle.hash}</code>
                <p>
                  Evaluator:{' '}
                  {bundle.evaluator ||
                    'No supported behavioral evaluator; format alone cannot authorize activation.'}
                </p>
                <details>
                  <summary>Inspect complete skill bundle and provenance</summary>
                  <pre>{JSON.stringify(bundle, null, 2)}</pre>
                </details>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void work(async () =>
                      setExported(await api(`/evolution/skills/${bundle.id}/export`)),
                    )
                  }
                >
                  Inspect portable export
                </button>
                {!!exported && (
                  <pre aria-label="Portable skill export">{JSON.stringify(exported, null, 2)}</pre>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={trust}
                    onChange={(e) => setTrust(e.target.checked)}
                  />
                  I trust this exact packaged evaluator for local execution
                </label>
                <button
                  className="button"
                  disabled={
                    busy || !!running || !trust || !bundle.evaluator || bundle.status !== 'PROPOSED'
                  }
                  onClick={() =>
                    void work(async () => {
                      setJob(
                        await api(`/evolution/skills/${bundle.id}/evaluate`, {
                          expectedHash: bundle.hash,
                          baselineId: bundle.parentId,
                          trustExecution: trust,
                        }),
                      );
                      setTrust(false);
                    })
                  }
                >
                  Evaluate exact bundle against versioned cases
                </button>
                {evaluation && (
                  <>
                    <h3>
                      Evaluation comparison <Status value={evaluation.status} />
                    </h3>
                    <p>
                      Mode: {evaluation.mode}. This evaluates the packaged script, not model
                      decision quality.
                    </p>
                    <pre aria-label="Skill evaluation">{JSON.stringify(evaluation, null, 2)}</pre>
                  </>
                )}
                {active && (
                  <p>
                    Active on selected target: <b>{active.name}</b> · <code>{active.hash}</code>
                  </p>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={rollback}
                    onChange={(e) => {
                      setRollback(e.target.checked);
                      setChange(undefined);
                      setApprove(false);
                    }}
                  />
                  Prepare as rollback to a previously approved bundle
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !targetId || !evaluation}
                  onClick={() =>
                    void work(async () => {
                      setChange(
                        await api(`/evolution/skills/${bundle.id}/prepare`, {
                          targetId,
                          evaluationId: evaluation!.id,
                          rollback,
                        }),
                      );
                      setApprove(false);
                    })
                  }
                >
                  Prepare reviewed skill change
                </button>
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    !targetId ||
                    !active ||
                    active.bundleId !== bundle.id ||
                    bundle.version !== 'v1'
                  }
                  onClick={() =>
                    void work(async () => {
                      const b = await api<SkillBundle>('/evolution/skills/improvement', {
                        targetId,
                        parentId: bundle.id,
                      });
                      await load();
                      setBundleId(b.id);
                      setChange(undefined);
                      setTrust(false);
                      setRollback(false);
                    })
                  }
                >
                  Propose improvement from repeated health evidence
                </button>
                <button
                  className="button danger"
                  disabled={busy || (!!active && active.bundleId === bundle.id)}
                  onClick={() =>
                    void work(async () => {
                      await api(`/evolution/skills/${bundle.id}/reject`, {
                        expectedHash: bundle.hash,
                      });
                      await load();
                      setChange(undefined);
                    })
                  }
                >
                  Reject unactivated bundle
                </button>
                {active && (
                  <button
                    className="button secondary"
                    disabled={busy || !!running || !trust}
                    onClick={() =>
                      void work(async () => {
                        const h = await api<{ runs: HealthRun[] }>('/health/state');
                        const ids = h.runs
                          .filter((r) => r.targetId === targetId && r.status === 'SUCCEEDED')
                          .slice(0, 2)
                          .map((r) => r.id);
                        setJob(
                          await api('/evolution/skills/summarize', {
                            targetId,
                            expectedHash: active.hash,
                            healthRunIds: ids,
                            trustExecution: trust,
                          }),
                        );
                        setTrust(false);
                      })
                    }
                  >
                    Run active summary on recent health evidence
                  </button>
                )}
                {change && (
                  <>
                    <h3>
                      Exact active-instruction change <Status value={change.status} />
                    </h3>
                    <p>
                      {change.operation} · {change.name} · prior{' '}
                      {change.priorHash || 'no managed active bundle'}
                    </p>
                    <code>{change.hash}</code>
                    <pre aria-label="Skill activation diff">{change.diff}</pre>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={approve}
                        onChange={(e) => setApprove(e.target.checked)}
                      />
                      I approve this exact active skill change on the selected target
                    </label>
                    <button
                      className="button"
                      disabled={busy || !approve || change.status !== 'PROPOSED'}
                      onClick={() =>
                        void work(async () => {
                          setChange(
                            await api(`/evolution/skill-changes/${change.id}/apply`, {
                              expectedHash: change.hash,
                            }),
                          );
                          setApprove(false);
                          await load();
                        })
                      }
                    >
                      Apply approved skill change
                    </button>
                    <button
                      className="button danger"
                      disabled={busy || change.status !== 'PROPOSED'}
                      onClick={() =>
                        void work(async () => {
                          setChange(
                            await api(`/evolution/skill-changes/${change.id}/reject`, {
                              expectedHash: change.hash,
                            }),
                          );
                          await load();
                        })
                      }
                    >
                      Reject skill change
                    </button>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <p className="muted">
            No registered product skill bundles. Earlier documented candidates are not silently
            imported or activated.
          </p>
        )}
        <details>
          <summary>Import an additional inactive proposal</summary>
          <p>
            Use a JSON object with name, version, optional parentId, files (path/content), problem,
            benefit and evidence. Arbitrary scripts cannot execute without a separately supported
            evaluator.
          </p>
          <label>
            Skill proposal JSON
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} />
          </label>
          <button
            className="button secondary"
            disabled={busy || !importText.trim()}
            onClick={() =>
              void work(async () => {
                const b = await api<SkillBundle>(
                  '/evolution/skills/propose',
                  JSON.parse(importText),
                );
                await load();
                setBundleId(b.id);
                setImportText('');
              })
            }
          >
            Store inactive skill proposal
          </button>
        </details>
      </section>
      <section className="panel">
        <h2>Workflow metrics and execution history</h2>
        {job && (
          <>
            <Status value={job.status} />
            <p>
              {job.kind} · {job.id}
            </p>
            {job.error && <p role="alert">{job.error}</p>}
            {job.result !== undefined && (
              <pre aria-label="Evolution job result">{JSON.stringify(job.result, null, 2)}</pre>
            )}
            {running && (
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void work(async () => setJob(await api(`/evolution/jobs/${job.id}/cancel`, {})))
                }
              >
                Cancel knowledge/evaluation job
              </button>
            )}
          </>
        )}
        <p>
          Recorded denominators, null unavailable usage, labelled byte proxies and deterministic
          comparisons. No model-token savings claim.
        </p>
        {state && (
          <>
            <details>
              <summary>Inspect metric definitions and values</summary>
              <pre aria-label="Workflow metrics">{JSON.stringify(state.metrics, null, 2)}</pre>
            </details>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.kind} · {short(j.id)}
                      </td>
                      <td>
                        <Status value={j.status} />
                      </td>
                      <td>{j.createdAt}</td>
                      <td>
                        <button className="text-button" onClick={() => setJob(j)}>
                          Inspect operation
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
