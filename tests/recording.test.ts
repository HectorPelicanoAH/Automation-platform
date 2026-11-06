import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../packages/storage/store.ts';
import { RecordingManager } from '../packages/recording/manager.ts';
import { policyFor, safeUrl, safeText } from '../packages/recording/privacy.ts';
import {
  type CapturePolicy,
  type Recording,
  RECORDING_LIMITS,
} from '../packages/recording/model.ts';
import { createPlatform } from '../apps/server/app.ts';
const policy: CapturePolicy = {
  url: 'http://127.0.0.1:4311/?token=private-token',
  allowedOrigins: [],
  screenshots: false,
  maskSelectors: [],
  sensitiveQueryKeys: ['token'],
  retentionDays: 14,
  audioRetentionDays: 7,
  audioConsent: true,
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'qa-record-unit-'));
  const store = new Store(join(root, 'private'));
  const manager = new RecordingManager(store);
  const r: Recording = {
    id: randomUUID(),
    name: 'Synthetic record',
    status: 'RECORDING',
    createdAt: new Date().toISOString(),
    durationMs: 10_000,
    policy,
    events: 0,
    gaps: 0,
    bytes: 0,
    artifacts: [],
    audio: [],
    microphone: 'RECORDING',
    transcript: [],
    incomplete: false,
  };
  manager.repository.put(r);
  return { store, manager, r, root };
}
test('Recording policy suppresses query secrets and denies control/internal origins', () => {
  assert.throws(() => policyFor({ ...policy, url: 'file:///etc/passwd' }, 'http://localhost:4310'));
  assert.throws(() =>
    policyFor({ ...policy, url: 'http://127.0.0.1:4310' }, 'http://localhost:4310'),
  );
  assert.throws(() =>
    policyFor({ ...policy, allowedOrigins: ['http://localhost:4310'] }, 'http://127.0.0.1:4310'),
  );
  const safe = safeUrl('https://user:password@example.test/a?token=secret&country=es#private');
  for (const secret of ['password', 'secret', 'country=es', 'private'])
    assert.ok(!safe.includes(secret));
  assert.equal(safeText('Hello private-value', ['private-value']), 'Hello [REDACTED]');
  assert.ok(!safeText('Link /route?email=private-email').includes('private-email'));
  assert.ok(!safeText('https://example.test/route?email=private-email').includes('private-email'));
});
test('Audio acknowledgment, missing chunks, timing budgets, revisions and retention are honest', () => {
  const { store, manager, r } = fixture();
  try {
    const input = {
      sequence: 0,
      startMs: 0,
      endMs: 1000,
      sourceEndMs: 500,
      offsetMs: 500,
      uncertaintyMs: 2,
      mime: 'audio/webm',
      base64: Buffer.from('synthetic audio fixture; not a microphone sample').toString('base64'),
    };
    assert.equal(manager.audio(r.id, input).acknowledged, true);
    assert.equal(manager.audio(r.id, input).sequence, 0);
    assert.throws(() => manager.audio(r.id, { ...input, base64: 'c2VjcmV0' }));
    manager.audio(r.id, { ...input, sequence: 2, startMs: 1000, endMs: 2000, sourceEndMs: 1500 });
    assert.equal(manager.repository.get(r.id).incomplete, true);
    assert.match(manager.repository.events(r.id).at(-1)!.detail, /Missing audio chunks/);
    assert.throws(() => manager.audio(r.id, { ...input, sequence: 3, uncertaintyMs: -1 }));
    assert.throws(() =>
      manager.audio(r.id, {
        ...input,
        sequence: 3,
        base64: Buffer.alloc(RECORDING_LIMITS.chunkBytes + 1).toString('base64'),
      }),
    );
    assert.throws(() => manager.audio(r.id, { ...input, sequence: 3, mime: 'text/html' }));
    const full = { ...manager.repository.get(r.id), bytes: RECORDING_LIMITS.bytes };
    assert.throws(() =>
      manager.repository.artifact(full, Buffer.from('overflow'), 'audio', 'audio/webm', 0),
    );
    assert.throws(() =>
      manager.repository.append(
        { ...full, events: RECORDING_LIMITS.events },
        { kind: 'gap', detail: 'overflow', timeMs: 0, receivedMs: 0, provenance: 'OBSERVED' },
      ),
    );
    manager.microphone(r.id, 'STOPPED');
    assert.throws(() => manager.microphone(r.id, 'RECORDING'));
    const saved = manager.transcript(
      r.id,
      [
        {
          startMs: 0,
          endMs: 1000,
          text: 'Expected free shipping',
          source: 'manual',
          provenance: 'NARRATED',
        },
      ],
      0,
    );
    assert.equal(saved.transcript[0].segments[0].source, 'manual');
    assert.throws(() => manager.transcript(r.id, [], 0));
    assert.throws(() =>
      manager.transcript(
        r.id,
        [{ startMs: 0, endMs: 50000, text: 'Future', source: 'manual', provenance: 'NARRATED' }],
        1,
      ),
    );
    const artifact = manager.repository.artifact(
      saved,
      Buffer.from('private test artifact'),
      'screenshot',
      'image/png',
      10,
    );
    assert.equal(
      manager.repository.read(r.id, artifact.name).bytes.toString(),
      'private test artifact',
    );
    const file = join(manager.repository.directory(r.id), artifact.name);
    writeFileSync(file, 'corrupted');
    assert.throws(() => manager.repository.read(r.id, artifact.name));
    const expired = manager.repository.get(r.id);
    expired.createdAt = new Date(Date.now() - 20 * 86400000).toISOString();
    manager.repository.put(expired);
    manager.repository.expire();
    assert.ok(manager.repository.get(r.id).artifacts.every((a) => a.expired));
    assert.throws(() => manager.repository.read(r.id, artifact.name));
  } finally {
    store.close();
  }
});
test('Recording restart preserves partial evidence and rejects artifact symlinks', () => {
  const { store, manager, r, root } = fixture();
  try {
    const a = manager.repository.artifact(r, Buffer.from('synthetic'), 'audio', 'audio/webm', 0);
    const file = join(manager.repository.directory(r.id), a.name);
    const other = join(root, 'outside');
    writeFileSync(other, 'secret');
    assert.ok(readFileSync(file).length > 0);
    unlinkSync(file);
    symlinkSync(other, file);
    assert.throws(() => manager.repository.read(r.id, a.name));
    const id = randomUUID();
    symlinkSync(root, join(manager.repository.root, id));
    assert.throws(() => manager.repository.directory(id));
    const restarted = new RecordingManager(store);
    const partial = restarted.repository.get(r.id);
    assert.equal(partial.status, 'INTERRUPTED');
    assert.equal(partial.incomplete, true);
    assert.equal(partial.artifacts.length, 1);
    assert.match(restarted.repository.events(r.id).at(-1)!.detail, /restarted/);
  } finally {
    store.close();
  }
});
test('Recorder HTTP schema/session/CSRF/artifact boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-record-http-'));
  const p = createPlatform({ dataDir: join(root, 'private') });
  try {
    assert.equal((await p.app.inject('/api/recordings')).statusCode, 401);
    const login = await p.app.inject({
      url: '/api/session',
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost' },
      payload: { token: p.launchToken },
    });
    const headers = {
      host: 'localhost',
      cookie: String(login.headers['set-cookie']).split(';')[0],
      'x-qa-session': login.json().proof,
      'x-qa-csrf': '',
    };
    headers['x-qa-csrf'] = (await p.app.inject({ url: '/api/state', headers })).json().csrf;
    const request = (url: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') =>
      p.app.inject({ url, method, headers, payload: payload as object });
    assert.equal(
      (
        await request('/api/recordings', {
          name: 'Denied',
          policy: { ...policy, url: 'http://127.0.0.1' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request('/api/recordings', {
          name: 'Bad protocol',
          policy: { ...policy, url: 'file:///secret' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request('/api/recordings', {
          name: 'Too many masks',
          policy: { ...policy, maskSelectors: Array(17).fill('input') },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await p.app.inject({
          url: '/api/recordings',
          method: 'POST',
          headers: { ...headers, 'x-qa-csrf': '' },
          payload: { name: 'No CSRF', policy },
        })
      ).statusCode,
      403,
    );
    const r: Recording = {
      id: randomUUID(),
      name: 'Denied microphone',
      status: 'RECORDING',
      createdAt: new Date().toISOString(),
      durationMs: 1000,
      policy: { ...policy, audioConsent: false },
      events: 0,
      gaps: 0,
      bytes: 0,
      artifacts: [],
      audio: [],
      microphone: 'OFF',
      transcript: [],
      incomplete: false,
    };
    p.recorder.repository.put(r);
    assert.equal(
      (await request(`/api/recordings/${r.id}/microphone`, { status: 'RECORDING' })).statusCode,
      403,
    );
    assert.equal(
      (await request(`/api/recordings/${r.id}/microphone`, { status: 'DENIED' })).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/recordings/${r.id}/transcript`,
          {
            baseRevision: 0,
            segments: [{ startMs: 0, endMs: 100, text: 'Manual fallback works' }],
          },
          'PUT',
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/recordings/${r.id}/transcript`,
          { baseRevision: 0, segments: [] },
          'PUT',
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await p.app.inject({ url: `/api/recordings/${r.id}/artifacts/..%2F..%2Fsecret`, headers }))
        .statusCode,
      404,
    );
    assert.equal(
      (await p.app.inject({ url: `/api/recordings/${r.id}?after=-1`, headers })).statusCode,
      400,
    );
  } finally {
    await p.app.close();
  }
});
