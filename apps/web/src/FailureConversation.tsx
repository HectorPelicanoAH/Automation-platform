import React, { useEffect, useState, useRef } from 'react';
import { api } from './api.ts';
import { Status } from './ui.tsx';
import { useLocale } from './locale.tsx';
import type { FailureDiscussion, GenerationTask } from '../../../packages/generation/model.ts';

export function FailureConversation({ runId, visible }: { runId: string; visible: boolean }) {
  const { language, t } = useLocale();
  const [discussion, setDiscussion] = useState<FailureDiscussion>();
  const [task, setTask] = useState<GenerationTask>();
  const [message, setMessage] = useState('');
  const [includeHealth, setIncludeHealth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const history = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [discussion?.turns.length, task?.status]);
  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const read = async () => {
      try {
        const d = await api<FailureDiscussion>(
          '/generation/runs/' + runId + '/discussion',
          undefined,
          'GET',
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (stopped) return;
        setDiscussion(d);
        const last = d.turns.at(-1);
        if (!last) {
          setTask(undefined);
          return;
        }
        const current = await api<GenerationTask>(
          '/generation/tasks/' + last.taskId,
          undefined,
          'GET',
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (stopped) return;
        setTask(current);
        if (['RUNNING', 'CANCEL_REQUESTED'].includes(current.status))
          timer = setTimeout(() => void read(), 1200);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Unable to load conversation');
      }
    };
    void read();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [runId, visible, revision]);
  const active = task && ['RUNNING', 'CANCEL_REQUESTED'].includes(task.status);
  return (
    <section className="panel failure-conversation" aria-label={t('AI failure conversation')}>
      <h3>{t('Discuss this failure with AI')}</h3>
      <p>
        {t('Ask about the failed step and compare solution options before reviewing a correction.')}
      </p>
      <details>
        <summary>{t('Evidence shared with AI')}</summary>
        <p>
          {t(
            'Ask about the error and compare solution options. The configured analysis model receives redacted run evidence, bounded proposal excerpts and recent conversation. Indexed target files are available through read-only tools. Screenshots and traces are referenced by name; their contents are not sent.',
          )}
        </p>
        <p>
          {t(
            'Advice does not change files, execute tests or approve repairs. Configure and enable AI in Generate first; sending a message uses the selected provider and may consume tokens.',
          )}
        </p>
      </details>
      {!discussion && !error && <p role="status">{t('Loading conversation…')}</p>}
      <div
        className="conversation-history"
        ref={history}
        tabIndex={0}
        aria-label={t('Conversation history')}
      >
        {discussion?.turns.map((turn) => (
          <article className="conversation-turn" key={turn.taskId}>
            <h4>{t('Your question')}</h4>
            <p className="conversation-text">{turn.question}</p>
            {turn.reply && (
              <>
                <h4>{t('AI advice')}</h4>
                <p className="conversation-text">{turn.reply.summary}</p>
                {turn.reply.options.map((option, index) => (
                  <div key={index}>
                    <h4>{option.title}</h4>
                    <p>{option.evidence}</p>
                    <ol>
                      {option.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <p>
                      <b>{t('Tradeoff / risk: ')}</b>
                      {option.risk}
                    </p>
                  </div>
                ))}
                {!!turn.reply.missingEvidence.length && (
                  <>
                    <h4>{t('Evidence still needed')}</h4>
                    <ul>
                      {turn.reply.missingEvidence.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            {!turn.reply && turn.taskId === task?.id && (
              <>
                <Status value={task.status} />
                {task.error && <p role="alert">{task.error}</p>}
              </>
            )}
          </article>
        ))}
      </div>
      {active && (
        <div role="status">
          <Status value={task.status} /> {t('Analyzing this failure…')}
          <ul>
            {task.events.slice(-4).map((event, index) => (
              <li key={index}>{event.text}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          void api<{ task: GenerationTask; discussion: FailureDiscussion }>(
            '/generation/runs/' + runId + '/discussion',
            { message, includeHealth, language },
          )
            .then((result) => {
              setDiscussion(result.discussion);
              setTask(result.task);
              setMessage('');
              setRevision((n) => n + 1);
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Unable to send message'))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          {t('Question about this failure')}
          <textarea
            required
            maxLength={4000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(
              'For example: the locator seems wrong. What evidence should I inspect and which fixes would you consider?',
            )}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeHealth}
            onChange={(e) => setIncludeHealth(e.target.checked)}
          />
          {t('Include latest completed Autohealth findings (may be stale; no checks are started)')}
        </label>
        <div className="button-row">
          <button className="button" disabled={busy || !discussion || !!active || !message.trim()}>
            {t('Send to AI')}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            {t('Refresh conversation')}
          </button>
          {active && (
            <button
              type="button"
              className="button secondary"
              disabled={busy || task.status === 'CANCEL_REQUESTED'}
              onClick={() => {
                setBusy(true);
                void api('/generation/tasks/' + task.id + '/cancel', {})
                  .then(() => setRevision((n) => n + 1))
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('Cancel AI response')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
