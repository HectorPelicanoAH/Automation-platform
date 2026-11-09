import { LocaleProvider, useLocale } from './locale.tsx';
import { FailureConversation } from './FailureConversation.tsx';
import { KnowledgePanel } from './KnowledgePanel.tsx';
import { HealthPanel, HealthSummary } from './HealthPanel.tsx';
import { MaintenancePanel } from './MaintenancePanel.tsx';
import { CoveragePanel } from './CoveragePanel.tsx';
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Feature, Run, Framework, Selection } from '../../../packages/domain/model.ts';
import './style.css';
import { api, setCsrf, type State } from './api.ts';
import { Empty, Status, short } from './ui.tsx';
import { RecordPanel } from './RecordPanel.tsx';
import { GenerationPanel } from './GenerationPanel.tsx';
import { WorkspacePanel } from './WorkspacePanel.tsx';

type View =
  | 'Dashboard'
  | 'Workspace'
  | 'Scenarios'
  | 'Repository'
  | 'Runs'
  | 'Record'
  | 'Generate'
  | 'Knowledge & Skills'
  | 'Autohealth';
type Check = { name: string; ready: boolean; detail: string };
const active = (run: Run) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(run.status);
const time = (value: string) => new Date(value).toLocaleString();
function App() {
  const { setLanguage, t } = useLocale();
  const [view, setView] = useState<View>('Dashboard');
  const [recordingsRevision, setRecordingsRevision] = useState(0);
  const [state, setState] = useState<State>();
  const [targetId, setTargetId] = useState('');
  const [requestedChange, setRequestedChange] = useState<{ id: string; targetId: string }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [trust, setTrust] = useState<{ fingerprint: string; trusted: boolean; warning: string }>();
  const [selectedRun, setSelectedRun] = useState('');
  const [log, setLog] = useState('');
  const [framework, setFramework] = useState<Framework>('playwright');
  const [selection, setSelection] = useState<Selection>({ kind: 'suite' });
  const [selectedFeature, setSelectedFeature] = useState('');
  const [editor, setEditor] = useState('');
  const [fileList, setFileList] = useState<string[]>([]);
  const [file, setFile] = useState<{ path: string; text: string }>();
  const refresh = useCallback(async () => {
    const next = await api<State>('/state');
    setCsrf(next.csrf);
    setState(next);
    setLanguage(next.settings.language);
    setTargetId((current) =>
      next.targets.some((t) => t.id === current) ? current : next.targets[0]?.id || '',
    );
  }, [setLanguage]);
  const task = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void task(async () => {
      const token = new URLSearchParams(location.hash.slice(1)).get('launch');
      if (token) {
        history.replaceState(null, '', location.pathname);
        const session = await api<{ proof: string }>('/session', { token });
        sessionStorage.setItem('qa-session-proof', session.proof);
      }
      await refresh();
    });
  }, [refresh]);
  useEffect(() => {
    if (!state) return;
    const abort = new AbortController();
    const consume = async () => {
      const response = await fetch('/api/events', {
        headers: { 'X-QA-Session': sessionStorage.getItem('qa-session-proof') || '' },
        signal: abort.signal,
      });
      if (!response.ok || !response.body)
        throw new Error('Live updates unavailable. Reload to reconnect.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!abort.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) {
          if (!abort.signal.aborted) throw new Error('Live updates ended. Reload to reconnect.');
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        if (frames.some((frame) => frame.includes('data: '))) await refresh();
      }
    };
    void consume().catch((e) => {
      if (!abort.signal.aborted) setError(String(e));
    });
    return () => abort.abort();
  }, [Boolean(state), refresh]);
  const loadFeatures = useCallback(async () => {
    if (!targetId) {
      setFeatures([]);
      return;
    }
    setFeatures(await api<Feature[]>(`/targets/${targetId}/features`));
    setTrust(await api(`/targets/${targetId}/trust`));
  }, [targetId]);
  useEffect(() => {
    setSelectedFeature('');
    setFile(undefined);
    void loadFeatures().catch((e) => setError(String(e)));
  }, [loadFeatures]);
  useEffect(() => {
    if (!targetId || !selectedFeature) return;
    const feature = features.find((f) => f.path === selectedFeature);
    if (!feature) return;
    let cancelled = false;
    void api<{ text: string | null }>(
      `/targets/${targetId}/draft?path=${encodeURIComponent(feature.path)}`,
    )
      .then((draft) => {
        if (!cancelled) {
          setEditor(draft.text ?? feature.text);
          if (draft.text && draft.text !== feature.text)
            setNotice('Recovered draft. Review it before saving.');
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [targetId, selectedFeature, features]);
  useEffect(() => {
    if (!selectedRun) return;
    const fetchLog = () => {
      void api<{ text: string }>(`/runs/${selectedRun}/log`)
        .then((r) => setLog(r.text))
        .catch((e) => setError(String(e)));
    };
    fetchLog();
    const timer = setInterval(fetchLog, 1500);
    return () => clearInterval(timer);
  }, [selectedRun]);
  useEffect(() => {
    if (view === 'Repository' && targetId)
      void task(async () => setFileList(await api(`/targets/${targetId}/tree`)));
  }, [view, targetId]);
  const target = state?.targets.find((t) => t.id === targetId);
  const run = state?.runs.find((r) => r.id === selectedRun);
  const feature = features.find((f) => f.path === selectedFeature);
  const execute = () =>
    task(async () => {
      const started = await api<Run>('/runs', {
        targetId,
        framework,
        selection,
        baseUrl: state!.settings.baseUrl,
        idempotencyKey: crypto.randomUUID(),
      });
      setSelectedRun(started.id);
      await refresh();
    });
  const recent = state?.runs.slice(0, 5) || [];
  const table = (runs: Run[]) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('Run / context')}</th>
            <th>{t('Framework')}</th>
            <th>{t('Outcome')}</th>
            <th>{t('Executed')}</th>
            <th>{t('Started')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.selection.kind === 'suite' ? t('Full suite') : r.selection.value}</b>
                <small>
                  {short(r.id)} ·{' '}
                  {state?.targets.find((t) => t.id === r.targetId)?.name || t('Target')}
                </small>
              </td>
              <td>
                <span className="framework">
                  {r.framework === 'playwright' ? t('◈ Playwright') : t('◇ Karate')}
                </span>
              </td>
              <td>
                <Status value={r.status} />
              </td>
              <td>
                {r.tests.length
                  ? `${r.tests.filter((t) => t.status === 'PASSED').length} / ${r.tests.length}`
                  : '—'}
              </td>
              <td>{time(r.createdAt)}</td>
              <td>
                <button
                  className="text-button"
                  onClick={() => {
                    setView('Runs');
                    setSelectedRun(r.id);
                  }}
                >
                  {t('Inspect ↗')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#" onClick={() => setView('Dashboard')}>
          <span className="brand-mark">{t('q.')}</span>
          <span>
            {t('QA Local')}
            <small>{t('functional engineering')}</small>
          </span>
        </a>
        <div className="nav-label">{t('WORKBENCH')}</div>
        <nav>
          {(
            [
              'Dashboard',
              'Workspace',
              'Scenarios',
              'Repository',
              'Runs',
              'Record',
              'Generate',
              'Knowledge & Skills',
              'Autohealth',
            ] as View[]
          ).map((name, index) => (
            <button
              key={t(name)}
              aria-label={t(name)}
              className={view === name ? 'nav-item selected' : 'nav-item'}
              onClick={() => setView(name)}
            >
              <span>{['◫', '▦', '≡', '⌘', '▷', '●', '✧', '◇', '✚'][index]}</span>
              {t(name)}
              {name === 'Runs' && state?.runs.some(active) ? <i className="dot" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="phase-label">{t('PHASE 06')}</span>
          <p>
            {t('A local foundation.')}
            <br />
            {t('Real tests. Clear evidence.')}
          </p>
          <small>
            {t('Record demonstrations, review AI proposals, and approve each generated change.')}
          </small>
        </div>
        <div className="local-badge">
          <i className="dot" /> {t('Local workstation')}
          <small>{t('Bound to loopback')}</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            {t('Workspace ')}
            <span>/</span> <b>{t(view)}</b>
          </div>
          <div className="header-right">
            <span className="local-pill">{t('● LOCAL FIRST')}</span>
            <select
              aria-label={t('Active automation target')}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('No target selected')}</option>
              {state?.targets.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{t('YOUR FUNCTIONAL TESTING WORKBENCH')}</p>
              <h1>
                {view === 'Dashboard'
                  ? t('Good tests start with clarity.')
                  : t(
                      {
                        Workspace: 'Your repositories, connected.',
                        Scenarios: 'Behavior, written clearly.',
                        Repository: 'Understand what you run.',
                        Runs: 'Execution with evidence.',
                        Record: 'Capture what actually happened.',
                        Generate: 'From evidence to reviewed tests.',
                        'Knowledge & Skills': 'Knowledge with evidence and review.',
                        Autohealth: 'Inspect health. Preserve control.',
                      }[view],
                    )}
              </h1>
              <p className="muted">
                {view === 'Dashboard'
                  ? t(
                      'Configure your workspace, run your contracts, and see what actually happened.',
                    )
                  : view === 'Workspace'
                    ? t(
                        'Application sources stay read-only. Automation lives in its own repository.',
                      )
                    : view === 'Scenarios'
                      ? t(
                          'Review the canonical Gherkin contract before executing its implementation.',
                        )
                      : view === 'Repository'
                        ? t('Read the target files behind your functional coverage.')
                        : view === 'Generate'
                          ? t(
                              'Inspect evidence, review requirements and validate staged UI/API automation.',
                            )
                          : view === 'Knowledge & Skills'
                            ? t(
                                'Source-linked discoveries, evaluated procedures and explicit reversible activation.',
                              )
                            : view === 'Autohealth'
                              ? t(
                                  'Read-only local checks with evidence, limits and recommended actions.',
                                )
                              : view === 'Record'
                                ? t(
                                    'Capture interactions and narration, preserve evidence and inspect gaps.',
                                  )
                                : t(
                                    'Independent UI and API coverage, with native reports and honest outcomes.',
                                  )}
              </p>
            </div>
            {state && (
              <a
                className="button secondary"
                href={state.settings.baseUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('Open application ↗')}
              </a>
            )}
          </div>
          {error && (
            <div role="alert" className="alert error">
              <b>{t('Action needed')}</b> {error}
              <button aria-label={t('Dismiss error')} onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {t(notice)}
            </div>
          )}
          {busy && (
            <p role="status" className="working">
              {t('Working…')}
            </p>
          )}
          {!state ? (
            <Empty
              title={busy ? t('Starting local session…') : t('A private local session is required')}
            >
              {t('Start the platform and use ')}
              <code>pnpm open</code> {t('to open its one-time launch link.')}
            </Empty>
          ) : (
            <>
              {state && (
                <RecordPanel
                  visible={view === 'Record'}
                  defaultUrl={state.settings.baseUrl}
                  onRecordingsChanged={() => setRecordingsRevision((revision) => revision + 1)}
                />
              )}
              <GenerationPanel
                visible={view === 'Generate'}
                recordingsRevision={recordingsRevision}
                requestedChange={requestedChange}
                targetId={targetId}
                sources={state.sources}
                targets={state.targets}
                baseUrl={state.settings.baseUrl}
                onRun={(id) => {
                  setSelectedRun(id);
                  setView('Runs');
                }}
              />
              {view === 'Knowledge & Skills' && (
                <KnowledgePanel key={targetId} targetId={targetId} />
              )}
              {view === 'Autohealth' && <HealthPanel key={targetId} targetId={targetId} />}
              {view === 'Dashboard' && (
                <HealthSummary targetId={targetId} onOpen={() => setView('Autohealth')} />
              )}
              {view === 'Dashboard' && (
                <>
                  <section className="welcome">
                    <div>
                      <span className="phase-label">{t('WORKSPACE OVERVIEW')}</span>
                      <h2>
                        {t('One place for your')}
                        <br />
                        {t('functional contracts.')}
                      </h2>
                      <p>
                        {t('Keep the business intent readable.')}
                        <br />
                        {t('Let the runners provide the evidence.')}
                      </p>
                      <button
                        className="button"
                        onClick={() => setView(target ? 'Runs' : 'Workspace')}
                      >
                        {target ? t('Start a run') : t('Connect a workspace')} <span>↗</span>
                      </button>
                    </div>
                    <div className="contract-card">
                      <div>
                        <i className="dot" /> {t('CONTRACT → EXECUTION')}
                      </div>
                      <pre>
                        <em>Given</em> a clear business context
                        <br />
                        <em>When</em> the customer takes an action
                        <br />
                        <em>Then</em> verify the observable result
                      </pre>
                      <div className="contract-runners">
                        <span>{t('◈ Playwright / UI')}</span>
                        <span>{t('◇ Karate / API')}</span>
                      </div>
                    </div>
                  </section>
                  <div className="stats">
                    {[
                      ['Context sources', state.sources.length, 'Read-only by default'],
                      ['Automation targets', state.targets.length, 'Independent repositories'],
                      ['Test runs', state.runs.length, 'Native execution evidence'],
                      [
                        'Active runs',
                        state.runs.filter(active).length,
                        'One worker · persisted queue',
                      ],
                    ].map(([label, value, detail]) => (
                      <article className="stat" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </article>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{t('Recent executions')}</h2>
                        <p className="muted">{t('Results from your actual test runners.')}</p>
                      </div>
                      <button className="text-button" onClick={() => setView('Runs')}>
                        {t('View all runs →')}
                      </button>
                    </div>
                    {recent.length ? (
                      table(recent)
                    ) : (
                      <Empty title={t('Your first run starts here')}>
                        {t(
                          'Connect an automation target, install its dependencies, then run a feature or suite.',
                        )}
                      </Empty>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{t('System readiness')}</h2>
                        <p className="muted">
                          {t('On-demand checks. No repository scripts are executed.')}
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          task(async () =>
                            setChecks(
                              await api(`/readiness${targetId ? '?targetId=' + targetId : ''}`),
                            ),
                          )
                        }
                      >
                        {t('Check readiness')}
                      </button>
                    </div>
                    {checks.length ? (
                      <div className="checks">
                        {checks.map((c) => (
                          <article key={c.name}>
                            <Status value={c.ready ? 'READY' : 'ACTION NEEDED'} />
                            <b>{c.name}</b>
                            <p>{c.detail}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="muted pad">
                        {t(
                          'Run a check to inspect SQLite, Chromium, Java and the selected target.',
                        )}
                      </p>
                    )}
                  </section>
                </>
              )}
              {view === 'Workspace' && (
                <WorkspacePanel
                  state={state}
                  busy={busy}
                  task={task}
                  refresh={refresh}
                  notice={setNotice}
                />
              )}
              {view === 'Scenarios' && <CoveragePanel targetId={targetId} />}
              {view === 'Scenarios' && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t('Canonical features')}</h2>
                      <p className="muted">
                        {t(
                          'Saved in your automation repository. Invalid edits remain recoverable drafts.',
                        )}
                      </p>
                    </div>
                    <select
                      aria-label={t('Feature to edit')}
                      value={selectedFeature}
                      onChange={(e) => setSelectedFeature(e.target.value)}
                    >
                      <option value="">{t('Select a feature')}</option>
                      {features.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {feature ? (
                    <>
                      <div className="file-header">
                        <code>{feature.path}</code>
                        <span>
                          {t('base ')}
                          {short(feature.hash)} · {feature.scenarios.length} {t('scenario(s)')}
                        </span>
                      </div>
                      <textarea
                        className="editor"
                        aria-label={t('Gherkin editor')}
                        spellCheck={false}
                        value={editor}
                        onChange={(e) => setEditor(e.target.value)}
                      />
                      <div className="editor-actions">
                        <span className="muted">
                          {editor === feature.text
                            ? t('No unsaved changes')
                            : t('Unsaved draft · API bindings may need separate review')}
                        </span>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            task(async () => {
                              await api(
                                `/targets/${targetId}/feature`,
                                {
                                  path: feature.path,
                                  text: editor,
                                  baseHash: feature.hash,
                                  save: false,
                                },
                                'PUT',
                              );
                              setNotice('Valid Gherkin. Draft persisted; repository unchanged.');
                            })
                          }
                        >
                          {t('Validate draft')}
                        </button>
                        <button
                          className="button"
                          disabled={busy || editor === feature.text}
                          onClick={() =>
                            task(async () => {
                              await api(
                                `/targets/${targetId}/feature`,
                                {
                                  path: feature.path,
                                  text: editor,
                                  baseHash: feature.hash,
                                  save: true,
                                },
                                'PUT',
                              );
                              await loadFeatures();
                              setNotice(
                                'Reviewed feature saved. API implementation was not changed.',
                              );
                            })
                          }
                        >
                          {t('Save reviewed feature')}
                        </button>
                      </div>
                      <div className="scenario-list">
                        {feature.scenarios.map((s) => (
                          <article key={s.id}>
                            <div>
                              <span className="eyebrow">
                                {s.examples.length ? t('SCENARIO OUTLINE') : t('SCENARIO')}
                              </span>
                              <h3>{s.name}</h3>
                              <p>{s.tags.join(' ')}</p>
                            </div>
                            <span>
                              {s.examples.length || 1} {t('example(s)')}
                            </span>
                            {s.examples.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      {Object.keys(s.examples[0].values).map((k) => (
                                        <th key={k}>{k}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.examples.map((row) => (
                                      <tr key={row.row}>
                                        {Object.entries(row.values).map(([k, value]) => (
                                          <td key={k}>{value}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty
                      title={
                        target
                          ? t('Choose a functional contract')
                          : t('Connect an automation target')
                      }
                    >
                      {t(
                        'Features and their Examples will appear here after you initialize or import a supported target.',
                      )}
                    </Empty>
                  )}
                </section>
              )}
              {view === 'Repository' && (
                <section className="panel repository">
                  <div className="file-tree">
                    <div className="panel-heading">
                      <h2>{t('Target files')}</h2>
                    </div>
                    {fileList.map((path) => (
                      <button
                        className={file?.path === path ? 'current' : ''}
                        key={path}
                        onClick={() =>
                          task(async () =>
                            setFile(
                              await api(
                                `/targets/${targetId}/file?path=${encodeURIComponent(path)}`,
                              ),
                            ),
                          )
                        }
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                  <div className="file-preview">
                    {file ? (
                      <>
                        <div className="file-header">
                          <code>{file.path}</code>
                          <span>{t('read-only preview')}</span>
                        </div>
                        <pre>{file.text}</pre>
                      </>
                    ) : (
                      <Empty title={t('Explore your implementation')}>
                        {t(
                          'Select a file to inspect it. Dependency, secret and generated directories are excluded.',
                        )}
                      </Empty>
                    )}
                  </div>
                </section>
              )}
              {view === 'Runs' && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{t('Run a functional contract')}</h2>
                        <p className="muted">
                          {t('Environment: ')}
                          {state.settings.baseUrl}
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => task(loadFeatures)}
                      >
                        {t('Refresh project')}
                      </button>
                      <span className="subtle-label">{t('ROW SELECTION NOT YET SUPPORTED')}</span>
                    </div>
                    {!target ? (
                      <Empty title={t('No automation target selected')}>
                        {t('Connect a target in Workspace first.')}
                      </Empty>
                    ) : (
                      <>
                        <div className="run-builder">
                          <label>
                            {t('Framework')}
                            <select
                              aria-label={t('Framework')}
                              value={framework}
                              onChange={(e) => setFramework(e.target.value as Framework)}
                            >
                              <option value="playwright">{t('Playwright · visible UI')}</option>
                              <option value="karate">{t('Karate · API state')}</option>
                            </select>
                          </label>
                          <label>
                            {t('Selection')}
                            <select
                              aria-label={t('Selection')}
                              value={selection.kind}
                              onChange={(e) =>
                                setSelection({ kind: e.target.value as Selection['kind'] })
                              }
                            >
                              <option value="suite">{t('Full suite')}</option>
                              <option value="feature">{t('Feature')}</option>
                              <option value="scenario">{t('Scenario identity')}</option>
                              <option value="tags">{t('Tag')}</option>
                            </select>
                          </label>
                          {selection.kind !== 'suite' && (
                            <label>
                              {t('Contract / tag')}
                              <select
                                aria-label={t('Selection value')}
                                value={selection.value || ''}
                                onChange={(e) =>
                                  setSelection({ ...selection, value: e.target.value })
                                }
                              >
                                <option value="">{t('Choose…')}</option>
                                {(selection.kind === 'feature'
                                  ? features.map((f) => [f.path, f.name])
                                  : selection.kind === 'scenario'
                                    ? features.flatMap((f) =>
                                        f.scenarios
                                          .filter((s) => !s.id.startsWith('unmapped:'))
                                          .map((s) => [s.id, s.name]),
                                      )
                                    : [
                                        ...new Set(
                                          features.flatMap((f) =>
                                            f.scenarios.flatMap((s) => s.tags),
                                          ),
                                        ),
                                      ].map((t) => [t, t])
                                ).map(([value, label]) => (
                                  <option value={value} key={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <button
                            className="button"
                            disabled={
                              busy ||
                              !trust?.trusted ||
                              (selection.kind !== 'suite' && !selection.value)
                            }
                            onClick={execute}
                          >
                            {t('▷ Start run')}
                          </button>
                        </div>
                        {trust && !trust.trusted && (
                          <div className="trust">
                            <b>{t('Review execution trust')}</b>
                            <p>{trust.warning}</p>
                            <code>SHA-256 {trust.fingerprint}</code>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                task(async () => {
                                  await api(`/targets/${targetId}/trust`, {
                                    fingerprint: trust.fingerprint,
                                  });
                                  await loadFeatures();
                                  setNotice(
                                    'Current project fingerprint trusted. Dependency installation remains an explicit CLI operation.',
                                  );
                                })
                              }
                            >
                              {t('Trust this project fingerprint')}
                            </button>
                          </div>
                        )}
                        <div className="setup-note">
                          {t('New target? Install its dependencies first:')}{' '}
                          <code>pnpm --dir ui install --frozen-lockfile</code> {t('and')}{' '}
                          <code>cd api &amp;&amp; ./gradlew test --no-daemon</code>
                          {t('. Use Java 21. The platform never auto-installs imported projects.')}
                        </div>
                      </>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>{t('Execution history')}</h2>
                      <span className="muted">
                        {state.runs.length} {t('run(s)')}
                      </span>
                    </div>
                    {state.runs.length ? (
                      table(state.runs)
                    ) : (
                      <Empty title={t('No executions yet')}>
                        {t('A run will show real outcomes, logs and collected native artifacts.')}
                      </Empty>
                    )}
                  </section>
                  {run && ['FAILED', 'INTERRUPTED'].includes(run.status) && (
                    <FailureConversation
                      key={'chat-' + run.id}
                      runId={run.id}
                      visible={view === 'Runs'}
                      onProposal={(id) => {
                        setTargetId(run.targetId);
                        setRequestedChange({ id, targetId: run.targetId });
                        setView('Generate');
                      }}
                    />
                  )}
                  {run && !run.proposalId && ['FAILED', 'INTERRUPTED'].includes(run.status) && (
                    <MaintenancePanel key={run.id} run={run} />
                  )}
                  {run && (
                    <section className="panel run-detail">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            {t('Run ')}
                            {short(run.id)}
                          </h2>
                          <p className="muted">
                            {run.framework} · {run.snapshot.length} {t('contract snapshot(s) ·')}{' '}
                            {time(run.createdAt)}
                          </p>
                        </div>
                        <Status value={run.status} />
                        {active(run) && (
                          <button
                            className="button danger"
                            disabled={busy}
                            onClick={() =>
                              task(async () => {
                                await api(`/runs/${run.id}/cancel`, {});
                                await refresh();
                              })
                            }
                          >
                            {t('Cancel run')}
                          </button>
                        )}
                      </div>
                      {run.error && <div className="alert error">{run.error}</div>}
                      <p className="coverage-note">
                        {run.framework === 'karate'
                          ? t(
                              'API state coverage. This result does not establish correct visible UI.',
                            )
                          : t('UI coverage. Assertions run against rendered browser content.')}
                      </p>
                      {run.tests.map((test) => (
                        <details key={test.nativeId}>
                          <summary>
                            <Status value={test.status} />
                            <b>{test.name}</b>
                            <span>
                              {Math.round(test.durationMs)} {t('ms ·')}{' '}
                              {test.scenarioId || t('unmapped identity')}
                            </span>
                          </summary>
                          {test.error && <pre className="failure">{test.error}</pre>}
                          {test.steps.length ? (
                            <ol className="steps">
                              {test.steps.map((step, index) => (
                                <li key={index}>
                                  <Status value={step.status} />
                                  {step.name}
                                  {step.error && <pre>{step.error}</pre>}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="muted pad">
                              {t('Step detail unavailable in this native result.')}
                            </p>
                          )}
                        </details>
                      ))}
                      <h3>{t('Runner log')}</h3>
                      <pre className="terminal">{log || 'Loading log…'}</pre>
                      <h3>{t('Collected artifacts')}</h3>
                      <div className="artifacts">
                        {run.artifacts.map((a) => (
                          <a
                            key={a.name}
                            href={`/api/runs/${run.id}/artifact?name=${encodeURIComponent(a.name)}`}
                            title={a.hash}
                            onClick={(event) => {
                              event.preventDefault();
                              void task(async () => {
                                const response = await fetch(
                                  `/api/runs/${run.id}/artifact?name=${encodeURIComponent(a.name)}`,
                                  {
                                    headers: {
                                      'X-QA-Session':
                                        sessionStorage.getItem('qa-session-proof') || '',
                                    },
                                  },
                                );
                                if (!response.ok) throw new Error('Artifact unavailable');
                                const url = URL.createObjectURL(await response.blob());
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = a.name.split('/').pop() || 'artifact';
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                              });
                            }}
                          >
                            <span>↧ {a.name}</span>
                            <small>
                              {(a.size / 1024).toFixed(1)} {t('KB')}
                            </small>
                          </a>
                        ))}
                      </div>
                      <p className="muted">
                        {t(
                          'Native files may contain sensitive test evidence. Downloads never execute inside the platform UI.',
                        )}
                      </p>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              {t('QA LOCAL ')}
              <i>/</i> {t('PHASE 06 FOUNDATION')}
            </span>
            <span>
              {state
                ? t('Node {value0} · SQLite {value1}', {
                    value0: state.versions.node,
                    value1: state.versions.sqlite,
                  })
                : t('Local-only session')}{' '}
              {t('· No AI required')}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
);
