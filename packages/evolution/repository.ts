import type { Store } from '../storage/store.ts';
import { AppError } from '../domain/model.ts';
import type {
  Knowledge,
  KnowledgeDocument,
  SkillBundle,
  SkillEvaluation,
  SkillChange,
  ActiveSkill,
} from './model.ts';
interface Objects {
  knowledge: Knowledge;
  document: KnowledgeDocument;
  bundle: SkillBundle;
  evaluation: SkillEvaluation;
  skillChange: SkillChange;
  active: ActiveSkill;
}
export class EvolutionRepository {
  constructor(readonly store: Store) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS evolution_objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS evolution_activity (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)',
    );
  }
  list<K extends keyof Objects>(kind: K): Objects[K][] {
    return (
      this.store.db
        .prepare('SELECT data FROM evolution_objects WHERE kind=? ORDER BY rowid DESC LIMIT 1000')
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  interruptActivities() {
    this.store.db
      .prepare(
        "UPDATE evolution_activity SET data=json_set(data,'$.status','INTERRUPTED') WHERE kind='skillInvocation' AND json_extract(data,'$.status')='RUNNING'",
      )
      .run();
  }
  byKnowledgeKey(targetId: string, key: string): Knowledge | undefined {
    const row = this.store.db
      .prepare(
        "SELECT data FROM evolution_objects WHERE kind='knowledge' AND json_extract(data,'$.targetId')=? AND json_extract(data,'$.key')=? LIMIT 1",
      )
      .get(targetId, key) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  get<K extends keyof Objects>(kind: K, id: string): Objects[K] {
    const row = this.store.db
      .prepare('SELECT data FROM evolution_objects WHERE id=? AND kind=?')
      .get(id, kind) as { data: string } | undefined;
    if (!row) throw new AppError(404, 'Knowledge/skill record unavailable');
    return JSON.parse(row.data);
  }
  put<K extends keyof Objects>(kind: K, value: Objects[K]) {
    this.store.db
      .prepare(
        'INSERT INTO evolution_objects VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, kind, JSON.stringify(value));
    return value;
  }
  immutable<K extends 'bundle' | 'evaluation' | 'document'>(kind: K, value: Objects[K]) {
    if (this.store.db.prepare('SELECT id FROM evolution_objects WHERE id=?').get(value.id))
      throw new AppError(409, 'Immutable version already exists');
    this.store.db
      .prepare('INSERT INTO evolution_objects VALUES (?,?,?)')
      .run(value.id, kind, JSON.stringify(value));
    return value;
  }
}
