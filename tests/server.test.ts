import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatform } from '../apps/server/app.ts';
import { demoApp } from '../apps/demo/app.ts';
import { createConnection } from 'node:net';
import { once } from 'node:events';

test('Platform shutdown closes an unfinished HTTP connection', { timeout: 6000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-shutdown-'));
  const { app } = createPlatform({ dataDir: join(root, 'private') });
  let markRequest = () => {};
  const receiving = new Promise<void>((resolve) => {
    markRequest = resolve;
  });
  app.addHook('onRequest', async () => {
    markRequest();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as import('node:net').AddressInfo;
  const socket = createConnection({ host: '127.0.0.1', port: address.port });
  let closing: Promise<unknown> | undefined;
  let bounded: boolean | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await once(socket, 'connect');
    // A client can leave an incomplete upload while navigating away.
    const host = `127.0.0.1:${address.port}`;
    socket.write(
      `POST /api/session HTTP/1.1\r\nHost: ${host}\r\nOrigin: http://${host}\r\nContent-Type: application/json\r\nContent-Length: 1024\r\n\r\n{"token":`,
    );
    await receiving;
    closing = app.close();
    bounded = await Promise.race([
      closing.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    socket.destroy();
    app.server.closeAllConnections();
    await (closing || app.close());
  }
  assert.equal(bounded, true, 'Shutdown must not wait for the browser to close its socket');
});

test('Local session, CSRF, path, argument and source-write boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-http-'));
  const platform = createPlatform({ dataDir: join(root, 'private') });
  const { app } = platform;
  try {
    assert.equal((await app.inject('/api/state')).statusCode, 401);
    assert.equal(
      (await app.inject({ url: '/api/state', headers: { host: 'evil.example' } })).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/api/session',
          method: 'POST',
          payload: { token: platform.launchToken },
        })
      ).statusCode,
      403,
    );
    const login = await app.inject({
      url: '/api/session',
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost' },
      payload: { token: platform.launchToken },
    });
    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const proof = login.json<{ proof: string }>().proof;
    // Cookies are shared across localhost ports: cookie alone must not grant access.
    assert.equal(
      (await app.inject({ url: '/api/state', headers: { host: 'localhost', cookie } })).statusCode,
      401,
    );
    const headers = { host: 'localhost', cookie, 'x-qa-session': proof, 'x-qa-csrf': '' };
    const state = await app.inject({ url: '/api/state', headers });
    assert.equal(state.statusCode, 200);
    headers['x-qa-csrf'] = state.json<{ csrf: string }>().csrf;
    assert.equal(
      (
        await app.inject({
          url: '/api/state',
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/api/settings',
          method: 'PUT',
          headers: { ...headers, 'x-qa-csrf': '' },
          payload: { baseUrl: 'http://localhost', retentionDays: 14 },
        })
      ).statusCode,
      403,
    );
    const sourcePath = join(root, 'source');
    mkdirSync(sourcePath);
    writeFileSync(join(sourcePath, 'evidence.txt'), 'unchanged');
    const source = await app.inject({
      url: '/api/sources',
      method: 'POST',
      headers,
      payload: {
        name: 'Source',
        path: sourcePath,
        kind: 'other',
        enabled: true,
        preferredRef: '',
        indexEnabled: false,
        include: [],
        exclude: [],
      },
    });
    assert.equal(source.statusCode, 200);
    const target = await app.inject({
      url: '/api/targets',
      method: 'POST',
      headers,
      payload: { name: 'Target', path: join(root, 'automation'), mode: 'initialize' },
    });
    assert.equal(target.statusCode, 200, target.body);
    const id = target.json<{ id: string }>().id;
    const read = (path: string) =>
      app.inject({ url: `/api/targets/${id}/file?path=${encodeURIComponent(path)}`, headers });
    assert.equal((await read('../source/evidence.txt')).statusCode, 403);
    assert.equal((await read('.git/config')).statusCode, 403);
    assert.equal(
      (
        await app.inject({
          url: `/api/sources/${source.json<{ id: string }>().id}/file`,
          method: 'PUT',
          headers,
          payload: { text: 'changed' },
        })
      ).statusCode,
      404,
    );
    assert.equal(readFileSync(join(sourcePath, 'evidence.txt'), 'utf8'), 'unchanged');
    const trust = (await app.inject({ url: `/api/targets/${id}/trust`, headers })).json<{
      fingerprint: string;
    }>();
    assert.equal(
      (
        await app.inject({
          url: `/api/targets/${id}/trust`,
          method: 'POST',
          headers,
          payload: { fingerprint: trust.fingerprint },
        })
      ).statusCode,
      200,
    );
    const run = {
      targetId: id,
      framework: 'playwright',
      selection: { kind: 'tags', value: '@smoke; touch /tmp/not-authorized' },
      baseUrl: 'http://127.0.0.1:4311',
      idempotencyKey: 'injection',
    };
    assert.equal(
      (await app.inject({ url: '/api/runs', method: 'POST', headers, payload: run })).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          url: '/api/runs',
          method: 'POST',
          headers,
          payload: { ...run, selection: { kind: 'row', value: '1' } },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ url: '/api/runs/unknown/artifact?name=../../etc/passwd', headers }))
        .statusCode,
      404,
    );
    const featurePath = 'contracts/features/promotions.feature';
    const original = (await read(featurePath)).json<{ hash: string; text: string }>();
    const invalid = await app.inject({
      url: `/api/targets/${id}/feature`,
      method: 'PUT',
      headers,
      payload: {
        path: featurePath,
        baseHash: original.hash,
        text: 'Scenario: invalid',
        save: true,
      },
    });
    assert.equal(invalid.statusCode, 422);
    assert.equal((await read(featurePath)).json<{ text: string }>().text, original.text);
    assert.equal(
      (await app.inject({ url: `/api/targets/${id}/draft?path=${featurePath}`, headers })).json<{
        text: string;
      }>().text,
      'Scenario: invalid',
    );
    writeFileSync(join(root, 'automation', featurePath), '# external edit\n' + original.text);
    assert.equal(
      (
        await app.inject({
          url: `/api/targets/${id}/feature`,
          method: 'PUT',
          headers,
          payload: { path: featurePath, baseHash: original.hash, text: original.text, save: true },
        })
      ).statusCode,
      409,
    );
  } finally {
    await app.close();
  }
});

test('Real demo API validates context and has deterministic independent states', async () => {
  const app = demoApp();
  try {
    for (const [country, threshold] of [
      ['es', 5000],
      ['pt', 6000],
    ] as const) {
      const result = await app.inject(
        `/api/promotions/free-shipping?countryIso=${country}&languageIso=${country}&brand=demo`,
      );
      assert.equal(result.statusCode, 200);
      assert.equal(result.json<{ thresholdMinor: number }>().thresholdMinor, threshold);
    }
    assert.equal(
      (await app.inject('/api/promotions/free-shipping?countryIso=invalid')).statusCode,
      400,
    );
    assert.equal(
      (await app.inject('/api/promotions/free-shipping?countryIso=fr&languageIso=fr&brand=demo'))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
