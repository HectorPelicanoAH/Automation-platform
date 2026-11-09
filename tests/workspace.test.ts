import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../packages/storage/store.ts';
import { Workspace } from '../packages/workspace/workspace.ts';
import { readText, replaceText } from '../packages/workspace/files.ts';
import { hash } from '../packages/domain/gherkin.ts';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

test('Root boundaries, readonly metadata, safe imports and conflict detection', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-workspace-')));
  const store = new Store(join(root, 'private'));
  try {
    const workspace = new Workspace(store, resolve('.'));
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(
      join(source, 'package.json'),
      JSON.stringify({ dependencies: { react: '19' }, scripts: { prepare: 'do-not-execute' } }),
    );
    const original = readFileSync(join(source, 'package.json'), 'utf8');
    const registered = workspace.addSource({
      name: 'Frontend',
      path: source,
      kind: 'frontend',
      preferredRef: 'main',
      enabled: true,
      indexEnabled: true,
      include: ['src/**'],
      exclude: ['.env'],
    });
    assert.deepEqual(registered.detected, ['JavaScript / TypeScript', 'react']);
    assert.equal(readFileSync(join(source, 'package.json'), 'utf8'), original);
    assert.throws(() => workspace.validateRoot(join(source, 'package.json')));
    assert.throws(() => workspace.validateRoot(source));
    assert.throws(() => workspace.validateRoot(resolve('.')));
    const alias = join(root, 'alias');
    symlinkSync(source, alias);
    assert.throws(() => workspace.validateRoot(alias));
    const target = workspace.initialize(join(root, 'automation') + '/', 'Tests');
    assert.ok(!readdirSync(target.path).includes('.git'));
    const path = 'contracts/features/promotions.feature';
    const file = readText(target.path, path);
    assert.equal(workspace.features(target)[0].scenarios[0].examples.length, 2);
    assert.throws(() => readText(target.path, '../source/package.json'));
    assert.throws(() => readText(target.path, '/etc/passwd'));
    writeFileSync(join(target.path, '.env'), 'SECRET=value');
    assert.throws(() => readText(target.path, '.env'));
    symlinkSync(join(source, 'package.json'), join(target.path, 'escape.json'));
    assert.throws(() => readText(target.path, 'escape.json'));
    replaceText(target.path, path, file.hash, '# reviewed\n' + file.text);
    assert.throws(() => replaceText(target.path, path, file.hash, file.text), /changed/);
    const importedPath = join(root, 'existing');
    cpSync(resolve('templates/automation'), importedPath, { recursive: true });
    execFileSync('git', ['init', importedPath], { stdio: 'ignore' });
    const before = hash(readFileSync(join(importedPath, 'contracts/manifest.json')));
    workspace.importTarget(importedPath, 'Existing');
    assert.equal(hash(readFileSync(join(importedPath, 'contracts/manifest.json'))), before);
    const backup = join(root, 'backup.sqlite');
    await store.backup(backup);
    assert.equal(store.integrity(), 'ok');
    const restored = new Database(backup, { readonly: true });
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(
      (restored.prepare('SELECT COUNT(*) count FROM sources').get() as { count: number }).count,
      1,
    );
    restored.close();
    store.close();
    const reopened = new Store(join(root, 'private'));
    assert.equal(reopened.list('sources').length, 1);
    assert.equal(reopened.list('targets').length, 2);
    reopened.close();
  } finally {
    if (store.db.open) store.close();
  }
});
