import { randomUUID } from 'node:crypto';
import { Store } from '../packages/storage/store.ts';
import { RecordingRepository } from '../packages/recording/repository.ts';
import type { Recording } from '../packages/recording/model.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatform } from '../apps/server/app.ts';
import { test, expect } from '@playwright/test';
import Fastify from 'fastify';
import { BrowserCapture } from '../packages/recording/capture.ts';
import {
  monotonicMs,
  type CapturePolicy,
  type EvidenceEvent,
} from '../packages/recording/model.ts';

test('Public headed capture: real actions, frames, popups, privacy and origin denial', async () => {
  const app = Fastify();
  let forwardedObservations = 0;
  let authorizationObserved = false;
  let cookieObserved = false;
  app.addHook('onRequest', async (req) => {
    if (req.url.includes('/__qa_observation_')) forwardedObservations++;
    if (req.headers.cookie?.includes('synthetic-cookie-secret')) cookieObserved = true;
  });
  const other = Fastify();
  app.get('/network', async (req, reply) => {
    authorizationObserved = req.headers.authorization === 'Bearer synthetic-auth-secret';
    return reply
      .header('Set-Cookie', 'session=synthetic-cookie-secret; Path=/; SameSite=Lax')
      .send({ private: 'network-body-secret-4128' });
  });
  other.get('/', async (_, reply) => reply.type('text/html').send('<button>Cross frame</button>'));
  const otherUrl = await other.listen({ host: '127.0.0.1', port: 0 });
  app.get('/', async (_, reply) =>
    reply
      .type('text/html')
      .send(
        `<script>fetch('/network?token=network-url-secret',{headers:{Authorization:'Bearer synthetic-auth-secret'}})</script><label>Email<input aria-label="Email" value="private-input-5231"></label><label>Password<input type="password" aria-label="Password" value="secret-password-8819"></label><select size="2" aria-label="Country"><option>Spain</option><option>Portugal</option></select><button onclick="history.pushState({},'', '/?token=secret-query-6123')">Change route</button><a target="_blank" href="/popup?email=private-email-4217">Open popup</a><form action="/submitted"><button>Submit</button></form><iframe title="Same frame" src="/frame"></iframe><iframe title="Cross frame" src="${otherUrl}"></iframe><button data-testid="private-wrapper"><span data-private>hidden-business-secret-5217</span>Private action</button><canvas aria-label="Unsupported drawing"></canvas>`,
      ),
  );
  app.get('/frame', async (_, reply) =>
    reply.type('text/html').send('<button>Frame action</button>'),
  );
  app.get('/popup', async (_, reply) =>
    reply.type('text/html').send('<button>Popup action</button>'),
  );
  app.get('/submitted', async (_, reply) => reply.type('text/html').send('Submitted'));
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  const policy: CapturePolicy = {
    url,
    allowedOrigins: [url, otherUrl],
    screenshots: true,
    maskSelectors: [],
    sensitiveQueryKeys: ['token'],
    retentionDays: 14,
    audioRetentionDays: 7,
    audioConsent: false,
  };
  const privateDir = mkdtempSync(join(tmpdir(), 'qa-record-persisted-'));
  let store = new Store(privateDir);
  let repository = new RecordingRepository(store);
  const recording: Recording = {
    id: randomUUID(),
    name: 'Real capture of synthetic fixture',
    status: 'RECORDING',
    createdAt: new Date().toISOString(),
    durationMs: 0,
    policy,
    events: 0,
    gaps: 0,
    bytes: 0,
    artifacts: [],
    audio: [],
    microphone: 'OFF',
    transcript: [],
    incomplete: false,
  };
  repository.put(recording);
  const baseMs = monotonicMs();
  const events: Omit<EvidenceEvent, 'sequence' | 'receivedMs'>[] = [];
  const screenshots: Buffer[] = [];
  const capture = new BrowserCapture(policy, baseMs, (event, image) => {
    events.push(event);
    if (image) screenshots.push(image);
    const current = repository.get(recording.id);
    const screenshot = image
      ? repository.artifact(
          current,
          image,
          'screenshot',
          'image/png',
          event.evidenceAtMs || event.timeMs,
        ).name
      : undefined;
    repository.append(current, { ...event, screenshot, receivedMs: monotonicMs() - baseMs });
  });
  try {
    const page = await capture.start(false);
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new-private-value-7815');
    await page.getByLabel('Password', { exact: true }).fill('new-password-9024');
    await page
      .getByRole('listbox', { name: 'Country' })
      .getByRole('option', { name: 'Portugal' })
      .click();
    await expect(page.getByRole('listbox', { name: 'Country' })).toHaveValue('Portugal');
    await page.getByRole('button', { name: 'Change route' }).click();
    await page
      .frameLocator('iframe[title="Same frame"]')
      .getByRole('button', { name: 'Frame action' })
      .click();
    await page
      .frameLocator('iframe[title="Cross frame"]')
      .getByRole('button', { name: 'Cross frame' })
      .click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open popup' }).click();
    const popup = await popupPromise;
    await popup.getByRole('button', { name: 'Popup action' }).click();
    await popup.reload();
    await popup.getByRole('button', { name: 'Popup action' }).click();
    await page.getByTestId('private-wrapper').click();
    await page.locator('canvas').click({ position: { x: 2, y: 2 } });
    await expect
      .poll(() => events.some((e) => e.kind === 'gap' && e.detail.includes('canvas')))
      .toBe(true);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect
      .poll(() => events.some((e) => e.kind === 'action' && e.detail === 'submit'))
      .toBe(true);
    await expect.poll(() => events.filter((e) => e.kind === 'action').length).toBeGreaterThan(6);
    await expect
      .poll(() => events.some((e) => e.kind === 'gap' && e.detail.includes('canvas')))
      .toBe(true);
    await expect
      .poll(() =>
        events.some((e) =>
          e.locators?.some((l) => l.kind === 'role' && l.count === 1 && l.matchesTarget),
        ),
      )
      .toBe(true);
    expect(new Set(events.map((e) => e.frameId).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(events.map((e) => e.pageId).filter(Boolean)).size).toBe(2);
    expect(events.some((e) => e.kind === 'navigation' && e.detail.includes('SPA'))).toBe(true);
    expect(screenshots.length).toBeGreaterThan(0);
    expect(forwardedObservations).toBe(0);
    expect(authorizationObserved).toBe(true);
    expect(cookieObserved).toBe(true);
    expect(events.some((e) => e.detail === 'fill/change (value omitted)')).toBe(true);
    expect(events.some((e) => e.detail === 'select (value omitted)')).toBe(true);
    const text = JSON.stringify(events);
    for (const secret of [
      'private-input-5231',
      'secret-password-8819',
      'new-private-value-7815',
      'new-password-9024',
      'secret-query-6123',
      'private-email-4217',
      'hidden-business-secret-5217',
      'synthetic-auth-secret',
      'synthetic-cookie-secret',
      'network-body-secret-4128',
      'network-url-secret',
    ])
      expect(text).not.toContain(secret);
    await expect(capture.navigate('https://unapproved.invalid/')).rejects.toThrow(/approved/);
    await capture.stop();
    store.close();
    store = new Store(privateDir);
    repository = new RecordingRepository(store);
    const persisted = repository.events(recording.id);
    expect(persisted.some((e) => e.dom && e.aria)).toBe(true);
    const shot = persisted.find((e) => e.screenshot)!;
    expect(repository.read(recording.id, shot.screenshot!).bytes.subarray(1, 4).toString()).toBe(
      'PNG',
    );
    const persistedText = JSON.stringify(persisted);
    for (const secret of [
      'synthetic-auth-secret',
      'synthetic-cookie-secret',
      'network-body-secret-4128',
      'network-url-secret',
      'private-email-4217',
      'hidden-business-secret-5217',
    ])
      expect(persistedText).not.toContain(secret);

    await test.info().attach('capture-evidence', {
      body: Buffer.from(JSON.stringify(events, null, 2)),
      contentType: 'application/json',
    });
    await test.info().attach('masked-capture', { body: screenshots[0], contentType: 'image/png' });
  } finally {
    writeFileSync('test-results/capture-events.json', JSON.stringify(events, null, 2));
    await capture.stop();
    store.close();
    await app.close();
    await other.close();
  }
});

test('Recorder can cancel during Chromium startup without leaving a worker', async () => {
  const p = createPlatform({ dataDir: mkdtempSync(join(tmpdir(), 'qa-record-early-stop-')) });
  try {
    const r = p.recorder.start(
      {
        name: 'Early cancellation fixture',
        policy: {
          url: 'http://127.0.0.1:1',
          allowedOrigins: [],
          screenshots: false,
          maskSelectors: [],
          sensitiveQueryKeys: [],
          retentionDays: 14,
          audioRetentionDays: 7,
          audioConsent: false,
        },
      },
      'http://localhost:4310',
    );
    const cancelled = await p.recorder.stop(r.id, true);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.incomplete).toBe(true);
    await expect
      .poll(() => {
        try {
          process.kill(-r.workerPid!, 0);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
  } finally {
    await p.app.close();
  }
});
