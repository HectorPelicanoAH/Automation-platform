import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { AppError } from '../domain/model.ts';
import type { Store } from '../storage/store.ts';
import { RecordingRepository } from './repository.ts';
import {
  monotonicMs,
  recordingActive,
  RECORDING_LIMITS,
  type CapturePolicy,
  type EvidenceEvent,
  type Recording,
  type TranscriptSegment,
} from './model.ts';
import { policyFor, recordingUrl, controlOrigin, safeUrl, safeText } from './privacy.ts';

export class RecordingManager {
  readonly repository: RecordingRepository;
  private active?: {
    id: string;
    baseMs: number;
    child: ChildProcess;
    timer: ReturnType<typeof setTimeout>;
    stopping?: Promise<void>;
  };
  private bases = new Map<string, number>();
  constructor(store: Store) {
    this.repository = new RecordingRepository(store);
    for (const record of this.repository.list())
      if (recordingActive(record.status)) {
        record.status = 'INTERRUPTED';
        record.incomplete = true;
        record.finishedAt = new Date().toISOString();
        record.error = 'Platform restarted; browser/audio capture was not resumed';
        this.repository.append(record, {
          kind: 'gap',
          detail: record.error,
          timeMs: record.durationMs,
          receivedMs: record.durationMs,
          provenance: 'OBSERVED',
        });
        this.repository.put(record);
      }
  }
  clock(id: string) {
    const r = this.repository.get(id);
    return {
      timeMs:
        this.bases.has(id) && recordingActive(r.status)
          ? monotonicMs() - this.bases.get(id)!
          : r.durationMs,
      active: recordingActive(r.status),
    };
  }
  private gap(r: Recording, detail: string) {
    if (r.events < RECORDING_LIMITS.events)
      this.repository.append(r, {
        kind: 'gap',
        detail: safeText(detail),
        timeMs: this.clock(r.id).timeMs,
        receivedMs: this.clock(r.id).timeMs,
        provenance: 'OBSERVED',
      });
    else {
      r.incomplete = true;
      this.repository.put(r);
    }
  }
  start(input: { name: string; policy: CapturePolicy }, control: string) {
    if (this.active) throw new AppError(409, 'A recorder is already active');
    const policy = policyFor(input.policy, control);
    const id = randomUUID();
    const baseMs = monotonicMs();
    this.bases.set(id, baseMs);
    const r: Recording = {
      id,
      name: input.name,
      status: 'STARTING',
      createdAt: new Date().toISOString(),
      durationMs: 0,
      policy: { ...policy, url: safeUrl(policy.url) },
      events: 0,
      gaps: 0,
      bytes: 0,
      artifacts: [],
      audio: [],
      microphone: 'OFF',
      transcript: [],
      incomplete: false,
    };
    this.repository.put(r);
    const env: Record<string, string> = {};
    for (const key of [
      'PATH',
      'HOME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'DISPLAY',
      'XAUTHORITY',
      'LANG',
      'LC_ALL',
      'PLAYWRIGHT_BROWSERS_PATH',
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(import.meta.dirname, 'worker.ts')],
      {
        cwd: join(import.meta.dirname, '../..'),
        env,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        detached: process.platform !== 'win32',
      },
    );
    const timer = setTimeout(() => {
      const current = this.repository.get(id);
      this.gap(current, 'Maximum recording duration reached');
      void this.stop(id, false);
    }, RECORDING_LIMITS.durationMs);
    timer.unref();
    this.active = { id, baseMs, child, timer };
    r.workerPid = child.pid;
    this.repository.put(r);
    child.on('message', (message: unknown) => {
      try {
        this.receive(id, message);
      } catch {
        try {
          const current = this.repository.get(id);
          current.error = 'Capture budget or persistence error; recording stopped';
          current.incomplete = true;
          this.repository.put(current);
          this.gap(current, current.error);
        } catch {
          /* A failed database must not prevent browser cleanup. */
        }
        void this.stop(id, true).catch(() => this.emergencyStop(id));
      }
    });
    child.once('error', () => this.fail(id, 'Recorder process could not start'));
    child.once('exit', (code, signal) => {
      try {
        const record = this.repository.get(id);
        record.workerExit = { code, signal };
        record.durationMs = Math.max(record.durationMs, this.clock(id).timeMs);
        this.repository.put(record);
        if (['STARTING', 'RECORDING'].includes(record.status)) {
          record.status = 'INTERRUPTED';
          record.incomplete = true;
          record.finishedAt = new Date().toISOString();
          this.gap(record, 'Recorder process exited before finalization');
          this.repository.put(record);
          this.bases.delete(id);
        }
      } catch {
        /* Restart reconciliation preserves the last durable state. */
      }
      if (this.active?.id === id) {
        clearTimeout(this.active.timer);
        this.active = undefined;
      }
    });
    child.send({ command: 'start', policy, baseMs });
    return r;
  }
  private emergencyStop(id: string) {
    const active = this.active;
    if (!active || active.id !== id) return;
    active.child.kill('SIGTERM');
    const timer = setTimeout(() => {
      try {
        process.kill(-active.child.pid!, 'SIGKILL');
      } catch {
        /* exited */
      }
    }, 6000);
    timer.unref();
  }
  private fail(id: string, message: string) {
    const r = this.repository.get(id);
    r.status = 'FAILED';
    r.error = message;
    r.incomplete = true;
    r.finishedAt = new Date().toISOString();
    this.repository.put(r);
    this.bases.delete(id);
  }
  private receive(id: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as {
      type: string;
      event?: EvidenceEvent;
      screenshot?: string;
      message?: string;
    };
    const r = this.repository.get(id);
    if (!recordingActive(r.status)) return;
    if (message.type === 'ready') {
      r.status = 'RECORDING';
      this.repository.put(r);
    } else if (message.type === 'closed') {
      this.gap(r, 'Controlled browser was closed; partial recording retained');
      void this.stop(id, true);
    } else if (message.type === 'error') {
      if (r.status === 'STARTING') {
        this.fail(id, message.message || 'Recorder launch failed');
        return;
      }
      this.gap(r, 'Browser operation failed; capture may be incomplete');
      r.error = message.message;
      this.repository.put(r);
    } else if (message.type === 'event' && message.event) {
      const event = message.event;
      if (
        !['action', 'navigation', 'network', 'clock', 'gap', 'page', 'marker'].includes(
          event.kind,
        ) ||
        !Number.isFinite(event.timeMs) ||
        event.timeMs < 0 ||
        Buffer.byteLength(JSON.stringify(event)) > RECORDING_LIMITS.eventBytes
      )
        return;
      r.durationMs = Math.max(r.durationMs, event.timeMs);
      if (message.screenshot && message.screenshot.length < RECORDING_LIMITS.artifactBytes * 1.4) {
        const image = this.repository.artifact(
          r,
          Buffer.from(message.screenshot, 'base64'),
          'screenshot',
          'image/png',
          event.evidenceAtMs || event.timeMs,
        );
        event.screenshot = image.name;
      } else if (message.screenshot) {
        this.gap(r, 'Screenshot exceeds transport budget; image omitted');
      }
      this.repository.append(r, { ...event, receivedMs: this.clock(id).timeMs });
    }
  }
  allowOrigin(id: string, origin: string, control: string) {
    const r = this.repository.get(id);
    if (!recordingActive(r.status) || this.active?.id !== id)
      throw new AppError(409, 'Recorder is not active');
    const value = recordingUrl(origin).origin;
    if (controlOrigin(value, control) || r.policy.allowedOrigins.length >= 16)
      throw new AppError(403, 'Origin expansion denied');
    if (!r.policy.allowedOrigins.includes(value)) {
      r.policy.allowedOrigins.push(value);
      this.repository.put(r);
      this.active.child.send({ command: 'origin', origin: value });
    }
    return r;
  }
  navigate(id: string, url: string, control: string) {
    const r = this.repository.get(id);
    const next = recordingUrl(url);
    if (controlOrigin(next.origin, control) || !r.policy.allowedOrigins.includes(next.origin))
      throw new AppError(403, 'Approve the application origin before navigating');
    if (this.active?.id !== id || r.status !== 'RECORDING')
      throw new AppError(409, 'Recorder not ready');
    this.active.child.send({ command: 'navigate', url: next.href });
    return { accepted: true };
  }
  microphone(id: string, status: Recording['microphone']) {
    const r = this.repository.get(id);
    if (!recordingActive(r.status)) throw new AppError(409, 'Recording is no longer active');
    if (status === 'RECORDING' && r.audio.length > 0 && r.microphone !== 'RECORDING')
      throw new AppError(
        409,
        'Start a new recording to capture another audio stream; manual narration remains available',
      );
    if (status === 'RECORDING' && !r.policy.audioConsent)
      throw new AppError(403, 'Audio consent was not granted for this recording');
    r.microphone = status;
    if (status === 'DENIED' || status === 'ERROR')
      this.gap(
        r,
        status === 'DENIED'
          ? 'Microphone permission denied; manual narration remains available'
          : 'Microphone capture error; audio may be incomplete',
      );
    this.repository.put(r);
    return r;
  }
  audio(
    id: string,
    input: {
      sequence: number;
      startMs: number;
      endMs: number;
      sourceEndMs: number;
      offsetMs: number;
      uncertaintyMs: number;
      mime: string;
      base64: string;
    },
  ) {
    const r = this.repository.get(id);
    if (!recordingActive(r.status) || !r.policy.audioConsent || r.microphone !== 'RECORDING')
      throw new AppError(409, 'Microphone capture is not active');
    const { sequence, startMs, endMs, sourceEndMs, offsetMs, uncertaintyMs, mime, base64 } = input;
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      sequence > 2000 ||
      ![startMs, endMs, sourceEndMs, offsetMs, uncertaintyMs].every(Number.isFinite) ||
      startMs < 0 ||
      endMs < startMs ||
      uncertaintyMs < 0 ||
      uncertaintyMs > 5000 ||
      Math.abs(sourceEndMs + offsetMs - endMs) > 5 ||
      endMs > this.clock(id).timeMs + 5000
    )
      throw new AppError(400, 'Invalid audio timing/sequence');
    if (
      !/^audio\/(webm|ogg|mp4)(;codecs=[a-z0-9.,-]+)?$/.test(mime) ||
      base64.length > Math.ceil((RECORDING_LIMITS.chunkBytes * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
    )
      throw new AppError(413, 'Audio type or chunk size denied');
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > RECORDING_LIMITS.chunkBytes)
      throw new AppError(413, 'Invalid audio chunk');
    const existing = r.audio.find((c) => c.sequence === sequence);
    if (existing) {
      const a = r.artifacts.find((a) => a.name === existing.artifact)!;
      if (a.hash !== createHash('sha256').update(bytes).digest('hex'))
        throw new AppError(409, 'Audio sequence already has different content');
      return { sequence, acknowledged: true };
    }
    const previous = r.audio.at(-1);
    const expected = (previous?.sequence ?? -1) + 1;
    if (sequence < expected) throw new AppError(409, 'Audio chunk arrived out of order');
    if (sequence > expected) this.gap(r, `Missing audio chunks ${expected}–${sequence - 1}`);
    if (previous && startMs < previous.endMs - 500)
      throw new AppError(400, 'Overlapping audio timeline');
    if (endMs - startMs > 10_000) this.gap(r, 'Delayed audio chunk; timing boundaries are coarse');
    if (
      r.artifacts.filter((a) => a.kind === 'audio').reduce((sum, a) => sum + a.bytes, 0) +
        bytes.length >
      RECORDING_LIMITS.audioBytes
    )
      throw new AppError(413, 'Audio budget exceeded');
    const a = this.repository.artifact(r, bytes, 'audio', mime, startMs);
    r.audio.push({
      sequence,
      startMs,
      endMs,
      sourceEndMs,
      offsetMs,
      uncertaintyMs,
      artifact: a.name,
    });
    r.durationMs = Math.max(r.durationMs, endMs);
    this.repository.put(r);
    return { sequence, acknowledged: true };
  }
  audioGap(id: string, detail: string) {
    const r = this.repository.get(id);
    if (!recordingActive(r.status)) throw new AppError(409, 'Recording ended');
    this.gap(r, detail);
    return { recorded: true };
  }
  transcript(id: string, segments: TranscriptSegment[], baseRevision: number) {
    const r = this.repository.get(id);
    if (baseRevision !== (r.transcript.at(-1)?.revision || 0))
      throw new AppError(409, 'Transcript changed; reload before saving');
    if (segments.length > 200 || r.transcript.length >= 50)
      throw new AppError(413, 'Transcript revision budget reached');
    for (const s of segments)
      if (
        !Number.isFinite(s.startMs) ||
        !Number.isFinite(s.endMs) ||
        s.startMs < 0 ||
        s.endMs < s.startMs ||
        s.endMs > Math.max(r.durationMs, this.clock(id).timeMs) + 1000 ||
        s.text.length > 4000
      )
        throw new AppError(400, 'Transcript segment outside recording timeline');
    const size = Buffer.byteLength(JSON.stringify(segments));
    if (r.bytes + size > RECORDING_LIMITS.bytes)
      throw new AppError(413, 'Transcript storage budget exceeded');
    r.bytes += size;
    r.transcript.push({
      revision: baseRevision + 1,
      createdAt: new Date().toISOString(),
      segments: segments.map((s) => ({
        ...s,
        text: safeText(s.text),
        source: 'manual',
        provenance: 'NARRATED',
      })),
    });
    this.repository.put(r);
    return r;
  }
  async stop(id: string, cancelled: boolean, lastSequence?: number) {
    const r = this.repository.get(id);
    const active = this.active;
    if (!recordingActive(r.status)) return r;
    if (!active || active.id !== id) throw new AppError(409, 'Active recorder unavailable');
    if (active.stopping) {
      await active.stopping;
      return this.repository.get(id);
    }
    r.status = 'STOPPING';
    this.repository.put(r);
    clearTimeout(active.timer);
    active.stopping = (async () => {
      let forced = false;
      await new Promise<void>((resolve) => {
        if (active.child.exitCode !== null) {
          resolve();
          return;
        }
        const force = setTimeout(() => {
          forced = true;
          try {
            process.kill(-active.child.pid!, 'SIGKILL');
          } catch {
            /* exited */
          }
          resolve();
        }, 6000);
        active.child.once('exit', () => {
          clearTimeout(force);
          resolve();
        });
        if (active.child.connected) active.child.send({ command: 'stop' });
        else active.child.kill('SIGTERM');
      });
      const final = this.repository.get(id);
      final.durationMs = Math.max(final.durationMs, this.clock(id).timeMs);
      if (final.microphone === 'RECORDING') {
        final.microphone = 'ERROR';
        this.gap(final, 'Recording stopped before microphone final acknowledgement');
      }
      if (lastSequence !== undefined && lastSequence > (final.audio.at(-1)?.sequence ?? -1))
        this.gap(final, 'Final microphone chunks were not acknowledged');
      if (forced)
        this.gap(final, 'Recorder shutdown exceeded grace period; process group was terminated');
      final.status = forced ? 'INTERRUPTED' : cancelled ? 'CANCELLED' : 'COMPLETED';
      final.incomplete ||= cancelled;
      final.finishedAt = new Date().toISOString();
      this.repository.put(final);
      this.bases.delete(id);
      if (this.active?.id === id) this.active = undefined;
    })();
    await active.stopping;
    return this.repository.get(id);
  }
  async shutdown() {
    if (this.active) await this.stop(this.active.id, true);
  }
}
