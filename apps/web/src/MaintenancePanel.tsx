import React, { useEffect, useState } from 'react';
import { api } from './api.ts';
import type { Run } from '../../../packages/domain/model.ts';
import type { Classification, Diagnosis, Repair } from '../../../packages/maintenance/model.ts';
import { Status } from './ui.tsx';

export function MaintenancePanel({ run }: { run: Run }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis>();
  const [repair, setRepair] = useState<Repair>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [classification, setClassification] = useState<Classification>('UNKNOWN');
  const [rationale, setRationale] = useState('');
  const [observed, setObserved] = useState('');
  const [path, setPath] = useState('');
  const [oldValue, setOldValue] = useState('');
  const [newValue, setNewValue] = useState('');
  const [featurePath, setFeaturePath] = useState(run.snapshot[0]?.path || '');
  const [baseUrl, setBaseUrl] = useState(run.baseUrl);
  const [trust, setTrust] = useState(false);
  const [approve, setApprove] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
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
    let cancelled = false;
    void api<{ diagnoses: Diagnosis[]; repairs: Repair[] }>(
      `/maintenance/state?runId=${encodeURIComponent(run.id)}`,
    )
      .then((s) => {
        if (cancelled) return;
        const d = s.diagnoses.find((d) => d.runId === run.id);
        setDiagnosis(d);
        if (d) {
          setClassification(d.conclusion);
          setRationale(d.rationale || '');
          setObserved(d.review?.observedEvidence || '');
          setPath(d.files.find((f) => /^ui\/(pages|components)\//.test(f.path))?.path || '');
        }
        setRepair(s.repairs.find((r) => r.originalRunId === run.id && r.diagnosisId === d?.id));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [run.id]);
  useEffect(() => {
    if (!repair || repair.status !== 'VALIDATING') return;
    let stopped = false;
    const timer = setInterval(() => {
      void api<Repair>(`/maintenance/repairs/${repair.id}`)
        .then((r) => {
          if (!stopped) setRepair(r);
        })
        .catch((e) => {
          if (!stopped) setError(String(e));
        });
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [repair?.id, repair?.status]);
  const action = async (name: string, body = { expectedHash: repair!.hash }) => {
    setRepair(await api<Repair>(`/maintenance/repairs/${repair!.id}/${name}`, body));
    setApprove(false);
    setReverse(false);
  };
  const source = diagnosis?.files.find((f) => f.path === path);
  return (
    <section className="panel maintenance-workbench" aria-label="Failure maintenance">
      <h2>Failure diagnosis &amp; repair</h2>
      <p>
        Inspect evidence, confirm intent and validate a minimal locator repair. Product regressions
        keep their original assertions.
      </p>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <button
        className="button secondary"
        disabled={busy || repair?.status === 'VALIDATING'}
        onClick={() =>
          void work(async () => {
            const d = await api<Diagnosis>(`/maintenance/runs/${run.id}/diagnose`, {});
            setDiagnosis(d);
            setRepair(undefined);
            setClassification('UNKNOWN');
            setRationale('');
            setObserved('');
            setFingerprint('');
            setApprove(false);
            setTrust(false);
            setPath(d.files.find((f) => /^ui\/(pages|components)\//.test(f.path))?.path || '');
          })
        }
      >
        {busy ? 'Working…' : 'Inspect failed run'}
      </button>
      {!diagnosis && (
        <p className="muted">
          No diagnosis loaded. Inspection reads local evidence and implementation; it does not probe
          the application.
        </p>
      )}
      {diagnosis && (
        <>
          <p>
            Evidence SHA-256 <code>{diagnosis.evidenceHash}</code>
          </p>
          {!diagnosis.executableCurrent && (
            <p role="alert">
              The executable changed since this run. A new failed run is required before proposing a
              repair.
            </p>
          )}
          <details>
            <summary>Failure evidence and uncertainty</summary>
            {diagnosis.evidence.map((e, i) => (
              <div key={i}>
                <b>{e.source}</b>
                <pre>{e.text}</pre>
              </div>
            ))}
            <ul>
              {diagnosis.hypotheses.map((h, i) => (
                <li key={i}>
                  {h.classification} · symptom: {h.reason}
                </li>
              ))}
            </ul>
            <ul>
              {diagnosis.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Dependencies and recent Git changes</summary>
            <pre>
              {JSON.stringify(
                {
                  graphIdentity: diagnosis.graphIdentity,
                  relationships: diagnosis.relatedEdges,
                  git: diagnosis.recentChanges,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <label>
            Reviewed classification
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as Classification)}
            >
              {(
                [
                  'UNKNOWN',
                  'LOCATOR_DEFECT',
                  'PRODUCT_REGRESSION',
                  'ENVIRONMENT',
                  'DATA',
                ] as Classification[]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Diagnostic rationale
            <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <label>
            Observed evidence and business intent
            <textarea value={observed} onChange={(e) => setObserved(e.target.value)} />
          </label>
          <button
            className="button secondary"
            disabled={busy || !rationale.trim() || !observed.trim()}
            onClick={() =>
              void work(async () => {
                setDiagnosis(
                  await api(`/maintenance/diagnoses/${diagnosis.id}/review`, {
                    expectedHash: diagnosis.evidenceHash,
                    classification,
                    rationale,
                    observedEvidence: observed,
                  }),
                );
              })
            }
          >
            Record diagnostic review
          </button>
          {diagnosis.review && (
            <p>
              Recorded conclusion: <b>{diagnosis.conclusion}</b>.{' '}
              {diagnosis.conclusion === 'PRODUCT_REGRESSION'
                ? 'Report the product defect; assertions remain unchanged.'
                : 'Review is an explicit human observation, not an automatically proven root cause.'}
            </p>
          )}
          {diagnosis.review && diagnosis.conclusion === 'LOCATOR_DEFECT' && (
            <>
              <label>
                Existing Page or component
                <select value={path} onChange={(e) => setPath(e.target.value)}>
                  {diagnosis.files
                    .filter((f) => /^ui\/(pages|components)\//.test(f.path))
                    .map((f) => (
                      <option key={f.path}>{f.path}</option>
                    ))}
                </select>
              </label>
              {source && (
                <details>
                  <summary>Inspect current implementation</summary>
                  <pre>{source.text}</pre>
                  <code>{source.hash}</code>
                </details>
              )}
              <label>
                Failed canonical feature
                <select value={featurePath} onChange={(e) => setFeaturePath(e.target.value)}>
                  {run.snapshot.map((f) => (
                    <option key={f.path}>{f.path}</option>
                  ))}
                </select>
              </label>
              <label>
                Old locator literal
                <input value={oldValue} onChange={(e) => setOldValue(e.target.value)} />
              </label>
              <label>
                Observed replacement literal
                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              </label>
              <button
                className="button"
                disabled={
                  busy ||
                  !diagnosis.executableCurrent ||
                  !oldValue ||
                  !newValue ||
                  (!!repair && !['REJECTED', 'INVALIDATED'].includes(repair.status))
                }
                onClick={() =>
                  void work(async () => {
                    setRepair(
                      await api(`/maintenance/diagnoses/${diagnosis.id}/repair`, {
                        expectedHash: diagnosis.evidenceHash,
                        path,
                        oldValue,
                        newValue,
                        featurePath,
                      }),
                    );
                    setFingerprint('');
                    setTrust(false);
                    setApprove(false);
                  })
                }
              >
                Propose literal locator repair
              </button>
            </>
          )}
        </>
      )}
      {repair && (
        <>
          <h3>
            Reviewed repair <Status value={repair.status} />
          </h3>
          <p>{repair.plan.summary}</p>
          <code>Diff SHA-256 {repair.hash}</code>
          <pre aria-label="Repair diff">{repair.diff}</pre>
          <p>
            Validation scope: all example rows in {repair.featurePath}. Review other shared Page
            dependents before application.
          </p>
          {repair.error && <p role="alert">{repair.error}</p>}
          {repair.status === 'STAGED' && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const prepared = await api<{ fingerprint: string }>(
                      `/maintenance/repairs/${repair.id}/prepare`,
                      { expectedHash: repair.hash },
                    );
                    setFingerprint(prepared.fingerprint);
                    setTrust(false);
                  })
                }
              >
                Prepare repair validation
              </button>
              {fingerprint && (
                <>
                  <p>
                    Staged executable: <code>{fingerprint}</code>. Execution uses host privileges
                    and trusted dependencies.
                  </p>
                  <label>
                    Repair validation URL
                    <input
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setTrust(false);
                      }}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={trust}
                      onChange={(e) => setTrust(e.target.checked)}
                    />
                    I trust this staged repair and selected environment for execution
                  </label>
                  <button
                    className="button"
                    disabled={busy || !trust}
                    onClick={() =>
                      void work(async () => {
                        await api(`/maintenance/repairs/${repair.id}/validate`, {
                          expectedHash: repair.hash,
                          fingerprint,
                          trustExecution: trust,
                          baseUrl,
                        });
                        setRepair(await api(`/maintenance/repairs/${repair.id}`));
                        setTrust(false);
                        setFingerprint('');
                      })
                    }
                  >
                    Run native repair validation
                  </button>
                </>
              )}
            </>
          )}
          {repair.validationRunId && (
            <p>
              Native validation run: <code>{repair.validationRunId}</code>. Results and artifacts
              are available in Runs.
            </p>
          )}
          {repair.status === 'VALIDATED' && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={approve}
                  onChange={(e) => setApprove(e.target.checked)}
                />
                I approve applying this exact repair diff
              </label>
              <button
                className="button"
                disabled={busy || !approve}
                onClick={() => void work(() => action('apply'))}
              >
                Apply reviewed repair
              </button>
            </>
          )}
          {!['APPLIED', 'APPLY_FAILED', 'REJECTED'].includes(repair.status) && (
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void work(() => action('cancel'))}
            >
              {repair.status === 'VALIDATING' ? 'Cancel repair validation' : 'Reject repair'}
            </button>
          )}
          {repair.status === 'APPLIED' && repair.rollback?.status !== 'APPLIED' && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void work(() => action('prepareRollback'))}
              >
                Inspect reversal diff
              </button>
              {repair.rollback && (
                <>
                  <pre aria-label="Reversal diff">{repair.rollback.diff}</pre>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={reverse}
                      onChange={(e) => setReverse(e.target.checked)}
                    />
                    I approve this exact reversal; the original failure may return
                  </label>
                  <button
                    className="button danger"
                    disabled={busy || !reverse}
                    onClick={() =>
                      void work(() => action('rollback', { expectedHash: repair.rollback!.hash }))
                    }
                  >
                    Apply reviewed reversal
                  </button>
                </>
              )}
            </>
          )}
          {repair.rollback?.status === 'APPLIED' && (
            <p>
              Reversal applied and journalled. Original failing implementation restored; no
              successful execution is implied.
            </p>
          )}
        </>
      )}
    </section>
  );
}
