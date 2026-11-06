import {
  mkdirSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  statfsSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Store } from '../storage/store.ts';
import { AppError } from '../domain/model.ts';
import {
  RECORDING_LIMITS,
  type Recording,
  type EvidenceEvent,
  type CaptureArtifact,
} from './model.ts';

export class RecordingRepository {
  readonly root: string;
  constructor(readonly store: Store) {
    this.root = join(store.directory, 'recordings');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (realpathSync(this.root) !== this.root) throw new Error('Recording root symlink denied');
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS recordings(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recording_events(recording_id TEXT NOT NULL REFERENCES recordings(id), sequence INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(recording_id,sequence));
      INSERT OR IGNORE INTO schema_version VALUES(2);
    `);
    this.expire();
  }
  list() {
    return (
      this.store.db.prepare('SELECT data FROM recordings ORDER BY rowid DESC').all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data) as Recording);
  }
  get(id: string) {
    const row = this.store.db.prepare('SELECT data FROM recordings WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new AppError(404, 'Recording not found');
    return JSON.parse(row.data) as Recording;
  }
  put(record: Recording) {
    this.store.db
      .prepare(
        'INSERT INTO recordings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(record.id, JSON.stringify(record));
  }
  directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id) || realpathSync(this.root) !== this.root)
      throw new AppError(403, 'Recording path denied');
    const path = join(this.root, id);
    if (existsSync(path) && realpathSync(path) !== path)
      throw new AppError(403, 'Recording symlink denied');
    return path;
  }
  events(id: string, after = 0) {
    this.get(id);
    return (
      this.store.db
        .prepare(
          'SELECT data FROM recording_events WHERE recording_id=? AND sequence>? ORDER BY sequence LIMIT 250',
        )
        .all(id, after) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as EvidenceEvent);
  }
  *iterateEvents(id: string) {
    this.get(id);
    for (const row of this.store.db
      .prepare('SELECT data FROM recording_events WHERE recording_id=? ORDER BY sequence')
      .iterate(id))
      yield JSON.parse((row as { data: string }).data) as EvidenceEvent;
  }
  append(record: Recording, event: Omit<EvidenceEvent, 'sequence'>) {
    if (record.events >= RECORDING_LIMITS.events)
      throw new AppError(413, 'Recording event limit reached');
    const result = { ...event, sequence: record.events + 1 };
    const size = Buffer.byteLength(JSON.stringify(result));
    if (size > RECORDING_LIMITS.eventBytes || record.bytes + size > RECORDING_LIMITS.bytes)
      throw new AppError(413, 'Capture event too large');
    this.store.db.transaction(() => {
      this.store.db
        .prepare('INSERT INTO recording_events VALUES(?,?,?)')
        .run(record.id, result.sequence, JSON.stringify(result));
      record.events++;
      record.bytes += size;
      if (event.kind === 'gap') {
        record.gaps++;
        record.incomplete = true;
      }
      this.put(record);
    })();
    return result;
  }
  artifact(
    record: Recording,
    bytes: Buffer,
    kind: CaptureArtifact['kind'],
    mime: string,
    timeMs: number,
  ) {
    if (
      bytes.length > RECORDING_LIMITS.artifactBytes ||
      record.bytes + bytes.length > RECORDING_LIMITS.bytes ||
      statfsSync(this.root).bavail * statfsSync(this.root).bsize < 256_000_000
    )
      throw new AppError(413, 'Recording artifact/disk budget exceeded');
    const directory = this.directory(record.id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const artifact: CaptureArtifact = {
      name: randomUUID(),
      kind,
      mime,
      bytes: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
      timeMs,
    };
    writeFileSync(join(directory, artifact.name), bytes, { mode: 0o600, flag: 'wx' });
    record.artifacts.push(artifact);
    record.bytes += bytes.length;
    this.put(record);
    return artifact;
  }
  read(id: string, name: string) {
    const r = this.get(id);
    const artifact = r.artifacts.find((a) => a.name === name && !a.expired);
    if (!artifact) throw new AppError(404, 'Recording artifact unavailable or expired');
    const file = join(this.directory(id), artifact.name);
    if (realpathSync(file) !== file) throw new AppError(403, 'Artifact symlink denied');
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.hash)
      throw new AppError(409, 'Recording artifact integrity failure');
    return { artifact, bytes };
  }
  expire() {
    for (const r of this.list()) {
      for (const a of r.artifacts) {
        const days = a.kind === 'audio' ? r.policy.audioRetentionDays : r.policy.retentionDays;
        if (!a.expired && Date.now() - Date.parse(r.createdAt) > days * 86400000) {
          const file = join(this.directory(r.id), a.name);
          if (existsSync(file) && realpathSync(file) === file) rmSync(file);
          a.expired = true;
        }
      }
      this.put(r);
    }
  }
}
