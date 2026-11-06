import type { Store } from '../storage/store.ts';
import { AppError } from '../domain/model.ts';
import type { HealthRun, HealthSchedule } from './model.ts';
export class HealthRepository {
  constructor(readonly store: Store) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS health_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS health_schedules (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
    );
  }
  runs() {
    return (
      this.store.db.prepare('SELECT data FROM health_runs ORDER BY rowid DESC LIMIT 100').all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data) as HealthRun);
  }
  run(id: string) {
    const r = this.store.db.prepare('SELECT data FROM health_runs WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!r) throw new AppError(404, 'Health run not found');
    return JSON.parse(r.data) as HealthRun;
  }
  put(run: HealthRun) {
    this.store.db
      .prepare(
        'INSERT INTO health_runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(run.id, JSON.stringify(run));
    return run;
  }
  schedules() {
    return (
      this.store.db.prepare('SELECT data FROM health_schedules ORDER BY rowid').all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data) as HealthSchedule);
  }
  schedule(value: HealthSchedule) {
    this.store.db
      .prepare(
        'INSERT INTO health_schedules VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, JSON.stringify(value));
    return value;
  }
}
