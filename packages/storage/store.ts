import Database from 'better-sqlite3';
import { mkdirSync, chmodSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Run, Source, Target } from '../domain/model.ts';

type Tables = { sources: Source; targets: Target; runs: Run };
export class Store {
  readonly db: Database.Database;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory);
    chmodSync(directory, 0o700);
    this.db = new Database(join(directory, 'platform.sqlite'));
    const engine = (this.db.prepare('SELECT sqlite_version() version').get() as { version: string })
      .version;
    const [major, minor, patch] = engine.split('.').map(Number);
    if (major < 3 || (major === 3 && (minor < 51 || (minor === 51 && patch < 3))))
      throw new Error('SQLite 3.51.3+ required');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 3000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES (1);
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, root TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS targets (id TEXT PRIMARY KEY, root TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES targets(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES targets(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    `);
    chmodSync(join(directory, 'platform.sqlite'), 0o600);
  }
  list<K extends keyof Tables>(table: K): Tables[K][] {
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Tables[K]);
  }
  get<K extends keyof Tables>(table: K, id: string): Tables[K] | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
      { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Tables[K]) : undefined;
  }
  put<K extends keyof Tables>(table: K, value: Tables[K]) {
    const data = JSON.stringify(value);
    if (table === 'runs')
      this.db
        .prepare('INSERT INTO runs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(value.id, (value as Run).targetId, data);
    else
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
        )
        .run(value.id, (value as Source | Target).path, data);
  }
  draft(targetId: string, path: string, text?: string) {
    const id = targetId + ':' + path;
    if (text !== undefined)
      this.db
        .prepare(
          'INSERT INTO drafts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(id, targetId, text);
    return (
      this.db.prepare('SELECT data FROM drafts WHERE id=?').get(id) as { data: string } | undefined
    )?.data;
  }
  event(run: Run) {
    this.put('runs', run);
    return this.db
      .prepare('INSERT INTO events(run_id,data) VALUES (?,?)')
      .run(run.id, JSON.stringify(run)).lastInsertRowid;
  }
  events(after: number) {
    return this.db
      .prepare('SELECT seq,data FROM events WHERE seq>? ORDER BY seq LIMIT 100')
      .all(after) as { seq: number; data: string }[];
  }
  async backup(destination: string) {
    await this.db.backup(destination);
  }
  integrity() {
    return this.db.pragma('integrity_check', { simple: true });
  }
  settings(value?: { baseUrl: string; retentionDays: number; language?: 'en' | 'es' }) {
    if (value)
      this.db
        .prepare(
          'INSERT INTO settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(JSON.stringify(value));
    const row = this.db.prepare('SELECT data FROM settings WHERE id=1').get() as
      { data: string } | undefined;
    return row
      ? {
          language: 'en' as 'en' | 'es',
          ...(JSON.parse(row.data) as {
            baseUrl: string;
            retentionDays: number;
            language?: 'en' | 'es';
          }),
        }
      : { baseUrl: 'http://127.0.0.1:4311', retentionDays: 14, language: 'en' as 'en' | 'es' };
  }
  close() {
    this.db.close();
  }
}
