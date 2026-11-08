import React, { useEffect, useState } from 'react';
import type { Run } from '../../../packages/domain/model.ts';
import { api } from './api.ts';
import { Status } from './ui.tsx';

const active = (run: Run) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(run.status);
// Runner output is plain text, including when it contains terminal formatting.
// eslint-disable-next-line no-control-regex -- remove ANSI escape sequences from native runner text
const plain = (text: string) => text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

export function ValidationRunPanel({
  runId,
  proposalId,
  targetId,
  visible,
  onInspect,
}: {
  runId: string;
  proposalId: string;
  targetId: string;
  visible: boolean;
  onInspect: (id: string) => void;
}) {
  const [run, setRun] = useState<Run>();
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setRun(undefined);
    setLog('');
    setError('');
    const load = async () => {
      try {
        const next = await api<Run>(
          '/runs/' + runId,
          undefined,
          'GET',
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (next.id !== runId || next.proposalId !== proposalId || next.targetId !== targetId)
          throw new Error('Validation run does not match this proposal.');
        if (stopped) return;
        setRun(next);
        const output = await api<{ text: string }>(
          '/runs/' + runId + '/log',
          undefined,
          'GET',
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (stopped) return;
        setLog(plain(output.text).slice(-32768));
        if (active(next)) timer = setTimeout(() => void load(), 1500);
      } catch (e) {
        if (!stopped)
          setError(e instanceof Error ? e.message : 'Unable to read validation details.');
      }
    };
    void load();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [runId, proposalId, targetId, visible, revision]);
  const failed = run?.tests.filter((test) => test.status === 'FAILED') || [];
  return (
    <section aria-label="Validation activity" className="validation-activity">
      <h3>Validation activity</h3>
      <p role="status">
        {run ? (
          <>
            <Status value={run.status} /> · {run.framework} · {run.tests.length} reported tests
          </>
        ) : (
          'Loading validation details…'
        )}
      </p>
      {error && (
        <>
          <p role="alert">
            Cannot refresh validation details: {error} The runner may still be active; inspect Runs
            before starting another execution.
          </p>
          <button className="button secondary" onClick={() => setRevision((n) => n + 1)}>
            Retry loading details
          </button>
        </>
      )}
      {run?.error && <pre className="validation-log">{plain(run.error)}</pre>}
      {failed.map((test) => (
        <div key={test.nativeId}>
          <h4>{test.name}</h4>
          <ul>
            {test.steps.map((step, i) => (
              <li key={i}>
                {step.status} · {step.name}
                {step.error && <pre className="validation-log">{plain(step.error)}</pre>}
              </li>
            ))}
          </ul>
          {test.error && <pre className="validation-log">{plain(test.error)}</pre>}
        </div>
      ))}
      <h4>Runner log (last 32 KB)</h4>
      <pre className="validation-log" tabIndex={0}>
        {log ||
          (run && !active(run) ? 'Runner produced no log output.' : 'Waiting for runner output…')}
      </pre>
      {run && !active(run) && (
        <p role="status" aria-label="Validation next steps">
          {run.status === 'PASSED'
            ? 'Native validation passed. Review and approve the exact diff to save the test files in the target.'
            : 'Validation did not pass. Inspect the failed step, runner log and available screenshots or traces. For a missing locator, verify the page state, previous steps, accessible role and name. For an assertion failure, compare actual behavior with the approved requirement before deciding whether the product or test needs correction. Review or regenerate the proposal, then prepare and explicitly run validation again. Preparing alone does not repair the test; target files have not been applied by this validation.'}
        </p>
      )}
      <div className="button-row">
        <button className="button secondary" onClick={() => onInspect(runId)}>
          Inspect validation run
        </button>
        {run && active(run) && (
          <button
            className="button secondary"
            disabled={cancelling || run.status === 'CANCEL_REQUESTED'}
            onClick={async () => {
              setCancelling(true);
              try {
                await api('/runs/' + runId + '/cancel', {});
                setRevision((n) => n + 1);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Cancellation failed.');
              } finally {
                setCancelling(false);
              }
            }}
          >
            Cancel validation
          </button>
        )}
      </div>
    </section>
  );
}
