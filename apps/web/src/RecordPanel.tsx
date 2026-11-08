import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { MicrophoneCapture } from './microphone.ts';
import { Empty, Status } from './ui.tsx';
import type {
  Recording,
  EvidenceEvent,
  TranscriptSegment,
} from '../../../packages/recording/model.ts';
const active = (r?: Recording) => r && ['STARTING', 'RECORDING', 'STOPPING'].includes(r.status);
async function artifact(id: string, name: string) {
  const response = await fetch(`/api/recordings/${id}/artifacts/${name}`, {
    headers: { 'X-QA-Session': sessionStorage.getItem('qa-session-proof') || '' },
  });
  if (!response.ok) throw new Error('Artifact unavailable, expired or failed integrity validation');
  return response.arrayBuffer();
}
export function RecordPanel({ visible, defaultUrl }: { visible: boolean; defaultUrl: string }) {
  const [list, setList] = useState<Recording[]>([]);
  const [record, setRecord] = useState<Recording>();
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [selected, setSelected] = useState('');
  const [event, setEvent] = useState<EvidenceEvent>();
  const [url, setUrl] = useState(defaultUrl);
  const [name, setName] = useState('Functional demonstration');
  const [screenshots, setScreenshots] = useState(false);
  const [consent, setConsent] = useState(false);
  const [masks, setMasks] = useState('[data-private]');
  const [origins, setOrigins] = useState('');
  const [retention, setRetention] = useState(14);
  const [audioRetention, setAudioRetention] = useState(7);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [audioMessage, setAudioMessage] = useState(
    'Microphone is off. Manual narration is always available.',
  );
  const [micStarting, setMicStarting] = useState(false);
  const [image, setImage] = useState('');
  const [audio, setAudio] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const mic = useRef<MicrophoneCapture | undefined>(undefined);
  const cursor = useRef(0);
  const current = useRef('');
  const previousRevision = useRef(-1);
  const editorVersion = useRef(0);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const all = await api<{ recordings: Recording[] }>('/recordings');
    setList(all.recordings);
    if (!current.current) {
      const running = all.recordings.find((r) => active(r));
      if (running) {
        current.current = running.id;
        setSelected(running.id);
      } else return;
    }
    const requested = current.current;
    const data = await api<{ recording: Recording; events: EvidenceEvent[] }>(
      `/recordings/${current.current}?after=${cursor.current}`,
    );
    if (current.current !== requested) return;
    setRecord(data.recording);
    if (data.events.length) {
      cursor.current = data.events.at(-1)!.sequence;
      setEvents((old) => [...old, ...data.events]);
    }
    const latest = data.recording.transcript.at(-1);
    if (previousRevision.current < 0) {
      previousRevision.current = latest?.revision || 0;
      setBaseRevision(latest?.revision || 0);
      if (editorVersion.current === 0) setSegments(latest?.segments || []);
    }
    if (!active(data.recording) && mic.current) {
      const capture = mic.current;
      mic.current = undefined;
      await capture.stop();
      setAudioMessage('Recording ended; microphone stopped.');
    }
  };
  useEffect(() => {
    let done = false;
    let pending = false;
    const tick = async () => {
      if (pending || done) return;
      pending = true;
      try {
        await refresh();
      } catch (e) {
        if (!done) setError(String(e));
        if (mic.current) {
          const capture = mic.current;
          mic.current = undefined;
          void capture.stop();
          setAudioMessage('Server disconnected; microphone stopped.');
        }
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      done = true;
      clearInterval(timer);
    };
    // A single live recorder panel stays mounted while navigating the workbench.
  }, []);
  useEffect(
    () => () => {
      void mic.current?.stop();
    },
    [],
  );
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  const choose = (id: string) => {
    current.current = id;
    cursor.current = 0;
    previousRevision.current = -1;
    editorVersion.current = 0;
    setSelected(id);
    setRecord(undefined);
    setEvents([]);
    setEvent(undefined);
    setImage('');
    setAudio('');
    setDirty(false);
  };
  const start = () =>
    run(async () => {
      const r = await api<Recording>('/recordings', {
        name,
        policy: {
          url,
          allowedOrigins: origins
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          screenshots,
          maskSelectors: masks
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          sensitiveQueryKeys: ['token', 'key', 'password'],
          retentionDays: retention,
          audioRetentionDays: audioRetention,
          audioConsent: consent,
        },
      });
      choose(r.id);
      setRecord(r);
      await refresh();
    });
  const stop = (cancel: boolean) =>
    run(async () => {
      const target = list.find((r) => active(r)) || record;
      if (!target) return;
      const capture = mic.current;
      mic.current = undefined;
      const lastSequence = capture ? await capture.stop() : undefined;
      setRecord(await api<Recording>(`/recordings/${target.id}/stop`, { cancel, lastSequence }));
      setAudioMessage('Microphone stopped.');
      await refresh();
    });
  const startMic = async () => {
    if (!record || !record.policy.audioConsent) return;
    setMicStarting(true);
    setError('');
    const capture = new MicrophoneCapture(record.id, setAudioMessage);
    mic.current = capture;
    try {
      await capture.start();
      await refresh();
    } catch (e) {
      if (mic.current === capture) mic.current = undefined;
      setError(String(e));
    } finally {
      setMicStarting(false);
    }
  };
  const stopMic = () =>
    run(async () => {
      const capture = mic.current;
      mic.current = undefined;
      if (capture) await capture.stop();
      else if (record) await api(`/recordings/${record.id}/microphone`, { status: 'ERROR' });
      setAudioMessage(
        capture
          ? 'Microphone stopped; acknowledged audio retained.'
          : 'Microphone producer unavailable after reload; manual narration remains available.',
      );
      await refresh();
    });
  const changeSegment = (index: number, patch: Partial<TranscriptSegment>) => {
    editorVersion.current++;
    setDirty(true);
    setSegments((old) => old.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const recording = list.find((r) => active(r));
  const evidence =
    event?.kind === 'action' && event.sourceEventId
      ? events.findLast((e) => e.kind === 'context' && e.sourceEventId === event.sourceEventId) ||
        event
      : event;
  return (
    <>
      {!visible && recording && (
        <div className="recording-banner" role="status">
          ● Recording: {recording.name} · microphone {recording.microphone}
          <button className="button secondary" disabled={busy} onClick={() => void stop(false)}>
            Stop recording
          </button>
        </div>
      )}
      <section hidden={!visible} className="record-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">OBSERVED EVIDENCE</span>
            <h2>Record a demonstration</h2>
            <p>
              Interact with the separate Chromium window. Actions are observations, not verified
              requirements.
            </p>
          </div>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="record-layout">
          <section className="panel record-settings">
            <h3>Capture policy</h3>
            <label>
              Recording name
              <input
                disabled={Boolean(recording)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </label>
            <label>
              Application URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:4311/promotions?countryIso=es&languageIso=es&brand=demo"
              />
            </label>
            <p className="muted">
              Page resources (images, styles, scripts, APIs, embedded frames and WebSockets) may
              load from other domains. Only approved origins are observed and stored. Approve an
              additional origin to navigate there or capture its interactions. Service workers
              remain disabled; browser and website restrictions still apply.
            </p>
            <label>
              Additional navigation / capture origins (optional, one per line)
              <textarea
                disabled={Boolean(recording)}
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
              />
            </label>
            <label>
              Private CSS regions (one per line)
              <textarea
                disabled={Boolean(recording)}
                value={masks}
                onChange={(e) => setMasks(e.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                disabled={Boolean(recording)}
                checked={screenshots}
                onChange={(e) => setScreenshots(e.target.checked)}
              />
              Capture masked screenshots
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                disabled={Boolean(recording)}
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Allow microphone capture for this session
            </label>
            <p className="muted">
              Audio can contain secrets and is retained locally without automatic redaction. No
              provider upload. Screenshots mask forms, private regions and frames; arbitrary visible
              secrets require your masking policy.
            </p>
            <label>
              Screenshot retention (days)
              <input
                type="number"
                min="1"
                max="365"
                disabled={Boolean(recording)}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
              />
            </label>
            <label>
              Audio retention (days)
              <input
                type="number"
                min="1"
                max="30"
                disabled={Boolean(recording)}
                value={audioRetention}
                onChange={(e) => setAudioRetention(Number(e.target.value))}
              />
            </label>
            <button
              className="button"
              disabled={busy || Boolean(recording)}
              onClick={() => void start()}
            >
              Start recording
            </button>
            <p className="muted">
              Network: method/status/type only; all query values omitted. Form values and keystrokes
              omitted. Video/raw traces disabled.
            </p>
          </section>
          <section className="panel">
            <h3>Sessions</h3>
            {!list.length ? (
              <Empty title="No recordings yet">
                Start a local demonstration to collect real evidence.
              </Empty>
            ) : (
              <label>
                Recording session
                <select
                  disabled={Boolean(recording)}
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="">Select a recording</option>
                  {list.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {record && (
              <>
                <div className="record-summary">
                  <h3>{record.name}</h3>
                  <Status value={record.status} />
                  <span>
                    {(record.durationMs / 1000).toFixed(1)} s · {record.events} events ·{' '}
                    {record.gaps} gaps
                  </span>
                </div>
                {record.incomplete && (
                  <p role="status" className="capture-warning">
                    Incomplete evidence: inspect capture gaps before using this recording.
                  </p>
                )}
                {record.error && <p role="alert">{record.error}</p>}
                {active(record) && (
                  <div className="actions">
                    <button className="button" disabled={busy} onClick={() => void stop(false)}>
                      Stop recording
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void stop(true)}
                    >
                      Cancel recording
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || record.status !== 'RECORDING'}
                      onClick={() =>
                        void run(async () => {
                          await api(`/recordings/${record.id}/navigate`, { url });
                        })
                      }
                    >
                      Navigate controlled browser
                    </button>
                  </div>
                )}
                <details>
                  <summary>Approved origins</summary>
                  <ul>
                    {record.policy.allowedOrigins.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                  {active(record) && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setRecord(
                            await api<Recording>(`/recordings/${record.id}/origins`, {
                              origin: url,
                            }),
                          );
                        })
                      }
                    >
                      Approve origin from Application URL
                    </button>
                  )}
                </details>
                <h3>Narration</h3>
                <p role="status">
                  {micStarting
                    ? 'Waiting for microphone permission — Stop recording cancels capture.'
                    : audioMessage}{' '}
                  · State: {record.microphone}
                </p>
                {active(record) && (
                  <div className="actions">
                    <button
                      className="button secondary"
                      disabled={
                        busy ||
                        micStarting ||
                        !record.policy.audioConsent ||
                        record.microphone === 'RECORDING' ||
                        record.audio.length > 0
                      }
                      onClick={() => void startMic()}
                    >
                      Start microphone
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || record.microphone !== 'RECORDING'}
                      onClick={() => void stopMic()}
                    >
                      Stop microphone
                    </button>
                  </div>
                )}
                <p className="muted">
                  Transcription: manual. No automatic engine configured. Manual text is narrated
                  intent, not observed UI behavior. Timestamps are seconds from recording start.
                </p>
                <p>{record.audio.length} acknowledged audio chunk(s)</p>
                {record.audio.length > 0 && record.microphone !== 'RECORDING' && (
                  <p className="muted">
                    Start a new recording to capture more audio. Manual narration can continue here.
                  </p>
                )}
                {record.audio.length > 0 && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const buffers = await Promise.all(
                          record.audio.map((c) => artifact(record.id, c.artifact)),
                        );
                        const mime = record.artifacts.find(
                          (a) => a.name === record.audio[0].artifact,
                        )!.mime;
                        setAudio(URL.createObjectURL(new Blob(buffers, { type: mime })));
                      })
                    }
                  >
                    Load local audio
                  </button>
                )}
                {audio && <audio controls src={audio} aria-label="Recorded narration" />}
                {segments.map((segment, index) => (
                  <fieldset key={index} className="transcript-segment">
                    <legend>Manual segment {index + 1}</legend>
                    <label>
                      Start (seconds)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={Number((segment.startMs / 1000).toFixed(1))}
                        onChange={(e) =>
                          changeSegment(index, { startMs: Number(e.target.value) * 1000 })
                        }
                      />
                    </label>
                    <label>
                      End (seconds)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={Number((segment.endMs / 1000).toFixed(1))}
                        onChange={(e) =>
                          changeSegment(index, { endMs: Number(e.target.value) * 1000 })
                        }
                      />
                    </label>
                    <label>
                      Narrated requirement
                      <textarea
                        value={segment.text}
                        onChange={(e) => changeSegment(index, { text: e.target.value })}
                      />
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        editorVersion.current++;
                        setDirty(true);
                        setSegments((old) => old.filter((_, i) => i !== index));
                      }}
                    >
                      Remove segment {index + 1}
                    </button>
                  </fieldset>
                ))}
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={segments.length >= 200}
                    onClick={() => {
                      editorVersion.current++;
                      setDirty(true);
                      setSegments((old) => [
                        ...old,
                        {
                          startMs: 0,
                          endMs: Math.max(0, record.durationMs),
                          text: '',
                          provenance: 'NARRATED',
                          source: 'manual',
                        },
                      ]);
                    }}
                  >
                    Add manual segment
                  </button>
                  <button
                    className="button"
                    disabled={busy || !dirty}
                    onClick={() =>
                      void run(async () => {
                        const savedVersion = editorVersion.current;
                        const savedId = record.id;
                        const saved = await api<Recording>(
                          `/recordings/${record.id}/transcript`,
                          {
                            baseRevision,
                            segments: segments.map(({ startMs, endMs, text }) => ({
                              startMs,
                              endMs,
                              text,
                            })),
                          },
                          'PUT',
                        );
                        if (current.current !== savedId) return;
                        setRecord(saved);
                        setBaseRevision(saved.transcript.at(-1)!.revision);
                        if (editorVersion.current === savedVersion) setDirty(false);
                      })
                    }
                  >
                    Save transcript revision
                  </button>
                </div>
                <details>
                  <summary>Transcript history ({record.transcript.length} revisions)</summary>
                  {record.transcript.map((r) => (
                    <div key={r.revision}>
                      <strong>Revision {r.revision}</strong>
                      <pre>{JSON.stringify(r.segments, null, 2)}</pre>
                    </div>
                  ))}
                </details>
              </>
            )}
          </section>
        </div>
        {record && (
          <section className="panel">
            <h3>Evidence timeline</h3>
            <p className="muted">
              Times include calibrated source clocks and uncertainty. Screenshot acquisition may
              follow its interaction. Page content remains untrusted data.
            </p>
            <div className="record-layout">
              <div className="timeline" aria-label="Recording events">
                {[...events]
                  .sort((a, b) => a.timeMs - b.timeMs || a.sequence - b.sequence)
                  .map((e) => (
                    <button
                      key={e.sequence}
                      className={'timeline-event ' + (e.kind === 'gap' ? 'capture-warning' : '')}
                      onClick={() => {
                        setEvent(e);
                        setImage('');
                      }}
                    >
                      <span>
                        {(e.timeMs / 1000).toFixed(2)} s · {e.kind}
                      </span>
                      <b>{e.detail}</b>
                      <small>
                        {e.pageId?.slice(0, 8)} / {e.frameId?.slice(0, 8)}
                      </small>
                    </button>
                  ))}
                {events.length < record.events && (
                  <button className="button secondary" onClick={() => void run(refresh)}>
                    Load more events
                  </button>
                )}
              </div>
              <div className="event-detail">
                {event ? (
                  <>
                    <h3>Event {event.sequence} · OBSERVED</h3>
                    <p>{event.url}</p>
                    <p>
                      Page {event.pageId} · Frame {event.frameId}
                    </p>
                    <p>
                      Source {event.sourceMs?.toFixed(2) ?? 'n/a'} ms · offset{' '}
                      {event.offsetMs?.toFixed(2) ?? 'n/a'} ms · uncertainty ±
                      {event.uncertaintyMs?.toFixed(2) ?? 'unknown'} ms
                    </p>
                    <pre>{evidence?.dom}</pre>
                    <pre>{evidence?.aria}</pre>
                    {evidence?.locators?.map((l, i) => (
                      <p key={i}>
                        <code>
                          {l.kind} {l.value} {l.name}
                        </code>{' '}
                        · {l.count} match(es) ·{' '}
                        {l.matchesTarget ? 'matches observed target' : 'unvalidated/ambiguous'}
                      </p>
                    ))}
                    {evidence?.screenshot && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            setImage(
                              URL.createObjectURL(
                                new Blob([await artifact(record.id, evidence!.screenshot!)], {
                                  type: 'image/png',
                                }),
                              ),
                            );
                          })
                        }
                      >
                        Inspect masked screenshot
                      </button>
                    )}
                    {image && (
                      <img
                        className="capture-image"
                        src={image}
                        alt="Masked screenshot from the observed interaction"
                      />
                    )}
                  </>
                ) : (
                  <p>Select an event to inspect its captured evidence.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </>
  );
}
