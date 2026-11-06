// Reproducible composition check: real promotion UI -> public capture -> private store -> restarted HTTP inspection.
// Worker supervision is validated separately by tests/recording-ui.spec.ts; this harness runs capture in process.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { log } from 'node:console';
import assert from 'node:assert/strict';
import { demoApp } from '../../apps/demo/app.ts';
import { createPlatform } from '../../apps/server/app.ts';
import { BrowserCapture } from '../../packages/recording/capture.ts';
import { monotonicMs } from '../../packages/recording/model.ts';
import { expect } from '@playwright/test';

const root = mkdtempSync(join(tmpdir(), 'qa-promotion-recording-'));
let platform = createPlatform({ dataDir: join(root, 'private') });
const demo = demoApp();
const url = await demo.listen({ host: '127.0.0.1', port: 0 });
const baseMs = monotonicMs();
const id = randomUUID();
const policy = {
  url,
  allowedOrigins: [url],
  screenshots: true,
  maskSelectors: [],
  sensitiveQueryKeys: [],
  retentionDays: 14,
  audioRetentionDays: 7,
  audioConsent: false,
};
platform.recorder.repository.put({
  id,
  name: 'Promotion demo composition validation',
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
});
const capture = new BrowserCapture(policy, baseMs, (event, image) => {
  const recording = platform.recorder.repository.get(id);
  if (image)
    event.screenshot = platform.recorder.repository.artifact(
      recording,
      image,
      'screenshot',
      'image/png',
      event.evidenceAtMs || event.timeMs,
    ).name;
  platform.recorder.repository.append(recording, { ...event, receivedMs: monotonicMs() - baseMs });
});
try {
  const page = await capture.start(false);
  await expect(page.getByRole('heading', { name: 'Envío gratis', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Envío gratis', exact: true }).click();
  for (let n = 0; n < 100; n++) {
    if (platform.recorder.repository.events(id).some((e) => e.dom && e.aria && e.screenshot)) break;
    await delay(50);
  }
  await capture.stop();
  const final = platform.recorder.repository.get(id);
  final.status = 'COMPLETED';
  final.finishedAt = new Date().toISOString();
  final.durationMs = monotonicMs() - baseMs;
  platform.recorder.repository.put(final);
  await platform.app.close();
  platform = createPlatform({ dataDir: join(root, 'private') });
  const login = await platform.app.inject({
    url: '/api/session',
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost' },
    payload: { token: platform.launchToken },
  });
  assert.equal(login.statusCode, 200);
  const headers = {
    host: 'localhost',
    cookie: String(login.headers['set-cookie']).split(';')[0],
    'x-qa-session': login.json().proof,
  };
  const response = await platform.app.inject({ url: `/api/recordings/${id}`, headers });
  assert.equal(response.statusCode, 200);
  const restored = response.json();
  assert.equal(restored.recording.status, 'COMPLETED');
  const evidence = restored.events.find((e) => e.dom && e.aria && e.screenshot);
  assert.ok(evidence, 'Actual demo DOM/ARIA/screenshot must survive application restart');
  assert.match(evidence.aria, /Envío gratis/);
  const image = await platform.app.inject({
    url: `/api/recordings/${id}/artifacts/${evidence.screenshot}`,
    headers,
  });
  assert.equal(image.statusCode, 200);
  assert.match(String(image.headers['content-disposition']), /attachment/);
  assert.equal(image.rawPayload.subarray(1, 4).toString(), 'PNG');
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/promotion-recording.png', image.rawPayload);
  const summary = {
    mode: 'In-process public capture composition; worker lifecycle separately tested',
    recordingId: id,
    status: restored.recording.status,
    events: restored.events,
    evidenceAfterRestart: true,
    artifactHash: restored.recording.artifacts.find((a) => a.name === evidence.screenshot).hash,
  };
  writeFileSync('test-results/promotion-recording-evidence.json', JSON.stringify(summary, null, 2));
  log(
    JSON.stringify({
      status: 'PASS',
      events: summary.events.length,
      evidenceAfterRestart: summary.evidenceAfterRestart,
    }),
  );
} finally {
  await capture.stop();
  await platform.app.close();
  await demo.close();
}
