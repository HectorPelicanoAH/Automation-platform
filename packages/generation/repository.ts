import { Store } from '../storage/store.ts';
import { AppError } from '../domain/model.ts';
import type { AiSettings, GenerationTask, ContractProposal, ChangeProposal } from './model.ts';
interface Objects {
  tasks: GenerationTask;
  contracts: ContractProposal;
  changes: ChangeProposal;
}
export class GenerationRepository {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS generation_objects (id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_settings (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_version VALUES (3);`);
    for (const task of this.list('tasks'))
      if (['RUNNING', 'CANCEL_REQUESTED'].includes(task.status)) {
        task.status = 'INTERRUPTED';
        task.error = 'Platform restarted; no automatic AI rerun';
        task.finishedAt = new Date().toISOString();
        this.put('tasks', task);
      }
  }
  list<K extends keyof Objects>(kind: K): Objects[K][] {
    return (
      this.store.db
        .prepare('SELECT data FROM generation_objects WHERE kind=? ORDER BY rowid DESC LIMIT 200')
        .all(kind) as { data: string }[]
    ).map((x) => JSON.parse(x.data));
  }
  get<K extends keyof Objects>(kind: K, id: string): Objects[K] {
    const row = this.store.db
      .prepare('SELECT data FROM generation_objects WHERE kind=? AND id=?')
      .get(kind, id) as { data: string } | undefined;
    if (!row) throw new AppError(404, 'Generation record not found');
    return JSON.parse(row.data);
  }
  changesForContract(id: string): ChangeProposal[] {
    return (
      this.store.db
        .prepare(
          "SELECT data FROM generation_objects WHERE kind='changes' AND json_extract(data,'$.contractId')=?",
        )
        .all(id) as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  put<K extends keyof Objects>(kind: K, value: Objects[K]) {
    this.store.db
      .prepare(
        'INSERT INTO generation_objects VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, kind, JSON.stringify(value));
    return value;
  }
  settings(value?: AiSettings): AiSettings {
    if (value)
      this.store.db
        .prepare(
          'INSERT INTO ai_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(JSON.stringify(value));
    const row = this.store.db.prepare('SELECT data FROM ai_settings WHERE id=1').get() as
      { data: string } | undefined;
    return row
      ? JSON.parse(row.data)
      : {
          enabled: false,
          binary: '',
          binaryHash: '',
          analysisModel: '',
          implementationModel: '',
          analysisEffort: 'medium',
          implementationEffort: 'medium',
        };
  }
}
