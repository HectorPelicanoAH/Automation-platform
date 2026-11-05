import React, { useState } from 'react';
import type { Source, Target } from '../../../packages/domain/model.ts';
import { api, type State } from './api.ts';
import { Status, short } from './ui.tsx';
export function WorkspacePanel({
  state,
  busy,
  task,
  refresh,
  notice,
}: {
  state: State;
  busy: boolean;
  task: (work: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  notice: (text: string) => void;
}) {
  const [editing, setEditing] = useState<Source>();
  const [source, setSource] = useState({
    name: '',
    path: '',
    kind: 'frontend',
    preferredRef: '',
    enabled: true,
    indexEnabled: false,
    include: '**/*',
    exclude: 'node_modules,dist,.git,.env',
  });
  const [target, setTarget] = useState({ name: '', path: '', mode: 'initialize' });
  const [settings, setSettings] = useState(state.settings);
  const list = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const saveSource = (event: React.FormEvent) => {
    event.preventDefault();
    void task(async () => {
      const body = { ...source, include: list(source.include), exclude: list(source.exclude) };
      if (editing) {
        const { path: _path, kind: _kind, ...changes } = body;
        await api(`/sources/${editing.id}`, changes, 'PATCH');
      } else await api('/sources', body);
      setEditing(undefined);
      setSource({
        name: '',
        path: '',
        kind: 'frontend',
        preferredRef: '',
        enabled: true,
        indexEnabled: false,
        include: '**/*',
        exclude: 'node_modules,dist,.git,.env',
      });
      await refresh();
      notice(
        'Source configuration saved. Files remain read-only; indexing is scheduled for Phase 3.',
      );
    });
  };
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Context sources</h2>
            <p className="muted">
              Frontend, backend and shared code. Registration does not execute repository scripts.
            </p>
          </div>
          <span className="read-only">READ ONLY</span>
        </div>
        <div className="source-grid">
          {state.sources.map((s) => (
            <article className="source-card" key={s.id}>
              <div>
                <span className="eyebrow">{s.kind}</span>
                <Status value={s.enabled ? 'ENABLED' : 'DISABLED'} />
              </div>
              <h3>{s.name}</h3>
              <code>{s.path}</code>
              <p>{s.detected.join(' · ') || 'No supported framework detected'}</p>
              <small>
                {s.git
                  ? `${s.git.branch} · ${short(s.git.commit)}`
                  : 'Local directory · no Git metadata'}
              </small>
              <button
                className="text-button"
                onClick={() => {
                  setEditing(s);
                  setSource({ ...s, include: s.include.join(','), exclude: s.exclude.join(',') });
                }}
              >
                Edit settings ↗
              </button>
            </article>
          ))}
        </div>
        <form className="form" onSubmit={saveSource}>
          <h3>{editing ? `Edit ${editing.name}` : 'Add a context source'}</h3>
          <div className="form-grid">
            <label>
              Display name
              <input
                required
                value={source.name}
                onChange={(e) => setSource({ ...source, name: e.target.value })}
                placeholder="Storefront"
              />
            </label>
            <label>
              Absolute local path
              <input
                required
                disabled={Boolean(editing)}
                value={source.path}
                onChange={(e) => setSource({ ...source, path: e.target.value })}
                placeholder="/workspace/storefront"
              />
            </label>
            <label>
              Repository type
              <select
                aria-label="Repository type"
                value={source.kind}
                disabled={Boolean(editing)}
                onChange={(e) => setSource({ ...source, kind: e.target.value })}
              >
                <option value="frontend">Frontend</option>
                <option value="backend">Backend</option>
                <option value="shared">Shared library</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Preferred branch or revision
              <input
                value={source.preferredRef}
                onChange={(e) => setSource({ ...source, preferredRef: e.target.value })}
                placeholder="Optional; never checks out your tree"
              />
            </label>
            <label>
              Include patterns, comma-separated
              <input
                value={source.include}
                onChange={(e) => setSource({ ...source, include: e.target.value })}
              />
            </label>
            <label>
              Exclude patterns, comma-separated
              <input
                value={source.exclude}
                onChange={(e) => setSource({ ...source, exclude: e.target.value })}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={source.enabled}
              onChange={(e) => setSource({ ...source, enabled: e.target.checked })}
            />
            Source enabled
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={source.indexEnabled}
              onChange={(e) => setSource({ ...source, indexEnabled: e.target.checked })}
            />
            Store indexing preference — indexing becomes available in Phase 3
          </label>
          <button className="button" disabled={busy}>
            {editing ? 'Save source settings' : 'Register read-only source'}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Automation targets</h2>
            <p className="muted">
              Separate projects with independently executable Playwright and Karate runners.
            </p>
          </div>
        </div>
        {state.targets.map((t) => (
          <div className="target-row" key={t.id}>
            <span className="target-icon">⌘</span>
            <div>
              <b>{t.name}</b>
              <code>{t.path}</code>
            </div>
            <span className="read-only">EXTERNAL TARGET</span>
          </div>
        ))}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              await api<Target>('/targets', target);
              await refresh();
              notice(
                'Automation target connected. Install its dependencies explicitly, then review execution trust in Runs.',
              );
            });
          }}
        >
          <div className="form-grid">
            <label>
              Target name
              <input
                required
                value={target.name}
                onChange={(e) => setTarget({ ...target, name: e.target.value })}
                placeholder="Functional tests"
              />
            </label>
            <label>
              Absolute target directory
              <input
                required
                value={target.path}
                onChange={(e) => setTarget({ ...target, path: e.target.value })}
                placeholder="/workspace/functional-tests"
              />
            </label>
            <label>
              Connection mode
              <select
                aria-label="Connection mode"
                value={target.mode}
                onChange={(e) => setTarget({ ...target, mode: e.target.value })}
              >
                <option value="initialize">
                  Initialize starter in an empty external directory
                </option>
                <option value="import">Import compatible existing target (no modifications)</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Initialization copies the starter only into your chosen empty destination. No Git
            repository is created. Import requires the documented manifest, ui/ and api/ layout.
          </p>
          <button className="button" disabled={busy}>
            Connect automation target
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Execution environment & retention</h2>
            <p className="muted">
              Use synthetic local data first. Credentials belong outside Git and are not stored
              here.
            </p>
          </div>
        </div>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              await api('/settings', settings, 'PUT');
              await refresh();
              notice('Environment and artifact retention saved. Retention is applied at startup.');
            });
          }}
        >
          <div className="form-grid">
            <label>
              Application base URL
              <input
                type="url"
                required
                value={settings.baseUrl}
                onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              />
            </label>
            <label>
              Artifact retention (days)
              <input
                type="number"
                min={1}
                max={3650}
                required
                value={settings.retentionDays}
                onChange={(e) =>
                  setSettings({ ...settings, retentionDays: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <button className="button secondary" disabled={busy}>
            Save environment
          </button>
        </form>
      </section>
    </>
  );
}
