import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { Status } from './ui.tsx';
import type { coverage } from '../../../packages/workspace/coverage.ts';
type Coverage = ReturnType<typeof coverage>;
export function CoveragePanel({ targetId }: { targetId: string }) {
  const [items, setItems] = useState<Coverage>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setItems([]);
    setError('');
    if (!targetId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<Coverage>('/targets/' + targetId + '/coverage', undefined, 'GET', abort.signal)
      .then(setItems)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [targetId, revision]);
  return (
    <section className="panel">
      <div className="pad">
        <h2>UI / API coverage</h2>
        <p className="muted">
          Separate observable properties and native outcomes. A passing API result does not
          establish visible UI correctness. Runs may use different environments or executable
          revisions; inspect their evidence before comparing.
        </p>
        <button
          className="button secondary"
          disabled={loading || !targetId}
          onClick={() => refresh((r) => r + 1)}
        >
          Refresh coverage
        </button>
      </div>
      {loading && <p role="status">Loading coverage…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && <p>No scenario coverage available.</p>}
      {items.map((item) => (
        <article className="pad" key={item.featurePath + ':' + item.scenarioId}>
          <h3>{item.name}</h3>
          <code>
            {item.scenarioId} · {item.contractHash.slice(0, 12)}
          </code>
          <table>
            <thead>
              <tr>
                <th>Framework</th>
                <th>Binding and assertions</th>
                <th>Latest native evidence</th>
              </tr>
            </thead>
            <tbody>
              {item.frameworks.map((f) => (
                <tr key={f.framework}>
                  <td>{f.framework}</td>
                  <td>
                    <Status value={f.bindingState} />
                    <p>{f.coverage || 'No declared coverage'}</p>
                    <code>{f.path}</code>
                  </td>
                  <td>
                    {f.evidence ? (
                      <>
                        <Status value={f.evidence.runStatus} />
                        <p>{f.evidence.tests.map((t) => t.status).join(', ')}</p>
                        <p>{f.evidence.baseUrl}</p>
                        <code>{f.evidence.runId}</code>
                        {!f.evidence.executableCurrent && (
                          <p>Executable has changed since this run.</p>
                        )}
                      </>
                    ) : (
                      'No executed evidence for this contract'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  );
}
