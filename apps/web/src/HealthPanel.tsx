import React, { useEffect, useState } from 'react';
import { api } from './api.ts';
import { Empty, Status, short } from './ui.tsx';
import type { HealthRun, HealthSchedule } from '../../../packages/health/model.ts';
interface HealthState {
  runs: HealthRun[];
  schedules: HealthSchedule[];
  scheduling: string;
}
export function HealthPanel({ targetId }: { targetId: string }) {
  const [state, setState] = useState<HealthState>();
  const [run, setRun] = useState<HealthRun>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalValue] = useState(30);
  const [threshold, setThreshold] = useState(2000);
  const [connection, setConnection] = useState<unknown>();
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
  const load = async () => {
    const s = await api<HealthState>('/health/state');
    setState(s);
  };
  useEffect(() => {
    let stopped = false;
    void api<HealthState>('/health/state')
      .then((s) => {
        if (stopped) return;
        setState(s);
        setRun(s.runs.find((r) => r.targetId === (targetId || undefined)));
        const schedule = s.schedules.find((s) => s.id === (targetId || 'platform'));
        setEnabled(schedule?.enabled || false);
        setIntervalValue(schedule?.intervalMinutes || 30);
        setThreshold(schedule?.slowSetupMs || 2000);
      })
      .catch((e) => {
        if (!stopped) setError(String(e));
      });
    return () => {
      stopped = true;
    };
  }, [targetId]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setInterval(() => {
      void api<HealthState>('/health/state', undefined, 'GET', abort.signal)
        .then((s) => {
          setState(s);
          setRun((r) =>
            r
              ? s.runs.find((n) => n.id === r.id) || r
              : s.runs.find((n) => n.targetId === (targetId || undefined)),
          );
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(String(e));
        });
    }, 1000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [targetId]);
  const active = state?.runs.some((r) => ['RUNNING', 'CANCEL_REQUESTED'].includes(r.status));
  const schedule = state?.schedules.find((s) => s.id === (targetId || 'platform'));
  return (
    <div className="generation-workbench evolution-workbench">
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <section className="panel">
        <h2>Autohealth — read-only diagnostics</h2>
        <p>
          Platform, automation and knowledge checks. Findings include evidence and recommended
          actions; no fixes, installs or instruction changes run automatically.
        </p>
        <button
          className="button"
          disabled={busy || active}
          onClick={() =>
            void work(async () => {
              setRun(
                await api('/health/runs', {
                  targetId: targetId || undefined,
                  slowSetupMs: threshold,
                }),
              );
              await load();
            })
          }
        >
          Run read-only health checks
        </button>
        <button className="button secondary" disabled={busy} onClick={() => void work(load)}>
          Refresh health history
        </button>
        {!targetId && (
          <p>
            Platform-only scope. Select an automation target to inspect its repositories and
            recorded knowledge.
          </p>
        )}
        <details>
          <summary>Local schedule and thresholds</summary>
          <p>
            Checks run only while this platform process is available. Missed runs are counted
            without a catch-up burst. Schedules never wake the OS or authorize fixes.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable local scheduled read-only checks
          </label>
          <label>
            Health interval in minutes
            <input
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={(e) => setIntervalValue(Number(e.target.value))}
            />
          </label>
          <label>
            Slow setup threshold in milliseconds
            <input
              type="number"
              min={100}
              max={120000}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await api('/health/schedule', {
                  targetId: targetId || undefined,
                  enabled,
                  intervalMinutes: interval,
                  slowSetupMs: threshold,
                });
                await load();
              })
            }
          >
            Save local health schedule
          </button>
          {schedule && <pre aria-label="Health schedule">{JSON.stringify(schedule, null, 2)}</pre>}
        </details>
        <details>
          <summary>Explicit AI connectivity check</summary>
          <p>
            Uses the configured trusted Codex connection only. No inference or credential copy.
            Connectivity is not probed by automatic health schedules.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void work(async () => setConnection(await api('/health/provider-connection', {})))
            }
          >
            Check configured provider connection
          </button>
          {!!connection && <pre>{JSON.stringify(connection, null, 2)}</pre>}
        </details>
      </section>
      <section className="panel">
        <h2>Findings and evidence</h2>
        {!state ? (
          <p>Loading health history…</p>
        ) : !run ? (
          <Empty title="No completed health inspection">
            Run checks on demand or explicitly enable a local schedule.
          </Empty>
        ) : (
          <>
            <Status value={run.status} />
            <p>
              {run.origin} · {run.createdAt} · {run.id}
            </p>
            {run.error && <p role="alert">{run.error}</p>}
            {['RUNNING', 'CANCEL_REQUESTED'].includes(run.status) && (
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void work(async () => setRun(await api(`/health/runs/${run.id}/cancel`, {})))
                }
              >
                Cancel health check
              </button>
            )}
            <p>
              A completed inspection may contain findings or unavailable checks. It is not a passing
              test execution.
            </p>
            <ul>
              {run.checks.map((c, i) => (
                <li key={i}>
                  <b>{c.name}</b> · {c.status} — {c.detail}
                </li>
              ))}
            </ul>
            {!run.findings.length && (
              <p>
                No findings recorded in the completed supported checks. Incomplete/cancelled checks
                are not certified healthy.
              </p>
            )}
            {run.findings.map((f) => (
              <details key={f.fingerprint}>
                <summary>
                  <Status value={f.severity} />
                  <b>{f.code}</b> · {f.confidence} · {f.root}
                </summary>
                <pre>{f.evidence.join('\n')}</pre>
                <p>Recommended action: {f.action}</p>
                <code>{f.fingerprint}</code>
              </details>
            ))}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Health execution history</h2>
        {state && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection</th>
                  <th>Origin</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.runs
                  .filter((r) => r.targetId === (targetId || undefined))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        {short(r.id)} · {r.createdAt}
                      </td>
                      <td>{r.origin}</td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td>{r.findings.length}</td>
                      <td>
                        <button className="text-button" onClick={() => setRun(r)}>
                          Inspect health run
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
export function HealthSummary({ targetId, onOpen }: { targetId: string; onOpen: () => void }) {
  const [run, setRun] = useState<HealthRun>();
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void api<HealthState>('/health/state', undefined, 'GET', abort.signal)
      .then((s) => setRun(s.runs.find((r) => r.targetId === (targetId || undefined))))
      .catch(() => {
        if (!abort.signal.aborted)
          setError('Health overview unavailable; open Autohealth to retry.');
      });
    return () => abort.abort();
  }, [targetId]);
  return (
    <section className="panel health-overview">
      <h2>Health overview</h2>
      <p>
        {error ||
          (run
            ? `${run.status} · ${run.findings.filter((f) => f.severity === 'ERROR').length} error findings · ${run.findings.filter((f) => f.severity === 'WARNING').length} warning findings`
            : 'No health inspection recorded for this scope.')}
      </p>
      <button className="text-button" onClick={onOpen}>
        Inspect Autohealth findings
      </button>
    </section>
  );
}
