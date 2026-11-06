import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatform } from '../apps/server/app.ts';
import { demoApp } from '../apps/demo/app.ts';
import { BrowserCapture } from '../packages/recording/capture.ts';
import { monotonicMs, type EvidenceEvent } from '../packages/recording/model.ts';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream'] } });

test('Record UI: real worker, denied microphone, manual revisions, cancellation and restart', async ({
  page,
  context,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'qa-record-ui-'));
  let p = createPlatform({ dataDir: join(root, 'private') });
  const demo = demoApp();
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  let base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () =>
          Promise.reject(
            new DOMException('Synthetic permission-denial fixture', 'NotAllowedError'),
          ),
      });
    });
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByLabel('Application URL', { exact: true }).fill(demoUrl);
    await page.getByLabel('Allow microphone capture for this session').check();
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await expect.poll(() => p.recorder.repository.list()[0]?.status).toBe('RECORDING');
    const id = p.recorder.repository.list()[0].id;
    await page.bringToFront();
    await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).microphone).toBe('DENIED');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Navigate controlled browser', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).events).toBeGreaterThan(2);
    await page.getByRole('button', { name: 'Add manual segment' }).click();
    await page
      .getByLabel('Narrated requirement')
      .fill('I expect the promotional title to be visible.');
    await page.getByRole('button', { name: 'Save transcript revision' }).click();
    await expect.poll(() => p.recorder.repository.get(id).transcript.length).toBe(1);
    await page
      .getByLabel('Narrated requirement')
      .fill('I expect the promotional title and amount to be visible.');
    await page.getByRole('button', { name: 'Save transcript revision' }).click();
    await expect.poll(() => p.recorder.repository.get(id).transcript.length).toBe(2);
    // Navigating the workbench must retain recording controls and the live microphone indicator.
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByText(/● Recording:/)).toBeVisible();
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).status).toBe('CANCELLED');
    expect(p.recorder.repository.get(id).incomplete).toBe(true);
    const workerPid = p.recorder.repository.get(id).workerPid!;
    await expect
      .poll(() => {
        try {
          process.kill(-workerPid, 0);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
    await page.screenshot({ path: 'test-results/recording-workbench.png', fullPage: true });
    await p.app.close();
    p = createPlatform({ dataDir: join(root, 'private') });
    base = await p.app.listen({ host: '127.0.0.1', port: 0 });
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByLabel('Recording session')).toBeVisible();
    await page.getByLabel('Recording session').selectOption(id);
    await expect(page.getByLabel('Narrated requirement')).toHaveValue(
      'I expect the promotional title and amount to be visible.',
    );
    expect(p.recorder.repository.get(id).transcript).toHaveLength(2);
    await page.getByLabel('Application URL', { exact: true }).fill(demoUrl);
    await page.getByLabel('Recording name').fill('Crash recovery fixture');
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await expect.poll(() => p.recorder.repository.list()[0]?.status).toBe('RECORDING');
    const crash = p.recorder.repository.list()[0];
    process.kill(crash.workerPid!, 'SIGKILL');
    await expect.poll(() => p.recorder.repository.get(crash.id).status).toBe('INTERRUPTED');
    expect(p.recorder.repository.get(crash.id).incomplete).toBe(true);
  } finally {
    await p.app.close();
    await demo.close();
  }
});

test('Five real minutes: synthetic microphone markers align with genuine browser actions', async () => {
  test.setTimeout(420_000);
  const root = mkdtempSync(join(tmpdir(), 'qa-record-clock-'));
  const p = createPlatform({ dataDir: join(root, 'private') });
  const demo = demoApp();
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  // Test-only synthetic input at the device boundary; MediaRecorder/transport/storage remain real.
  await context.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const audio = new AudioContext();
        await audio.resume();
        const rate = 16000;
        const buffer = audio.createBuffer(1, 312 * rate, rate);
        const data = buffer.getChannelData(0);
        for (const marker of [7, 307])
          for (let i = 0; i < rate * 0.2; i++)
            data[marker * rate + i] = 0.4 * Math.sin((2 * Math.PI * 880 * i) / rate);
        const source = audio.createBufferSource();
        source.buffer = buffer;
        const destination = audio.createMediaStreamDestination();
        source.connect(destination);
        source.start();
        destination.stream.getAudioTracks()[0].addEventListener('ended', () => void audio.close());
        return destination.stream;
      },
    });
  });
  const page = await context.newPage();
  let capture: BrowserCapture | undefined;
  const markers: Omit<EvidenceEvent, 'sequence' | 'receivedMs'>[] = [];
  try {
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByLabel('Recording name').fill('Synthetic audio / five-minute calibration');
    await page.getByLabel('Application URL', { exact: true }).fill(demoUrl);
    await page.getByLabel('Allow microphone capture for this session').check();
    await page.getByRole('button', { name: 'Start recording', exact: true }).click();
    await expect.poll(() => p.recorder.repository.list()[0]?.status).toBe('RECORDING');
    const id = p.recorder.repository.list()[0].id;
    const initial = p.recorder.repository.get(id);
    // Public capture harness shares the real session clock. No remote debugging endpoint is exposed.
    capture = new BrowserCapture(
      { ...initial.policy, url: demoUrl },
      monotonicMs() - p.recorder.clock(id).timeMs,
      (event) => {
        if (event.kind === 'action' && event.detail === 'click') markers.push(event);
      },
    );
    const observed = await capture.start(false);
    await page.bringToFront();
    await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
    await expect
      .poll(() => p.recorder.repository.get(id).audio.length, { timeout: 15_000 })
      .toBeGreaterThan(0)
      .catch(async (error) => {
        console.log(
          'Microphone diagnostic',
          await page.locator('[role=alert]').allTextContents(),
          p.recorder.repository.get(id).microphone,
        );
        throw error;
      });
    const audioStart = p.recorder.repository.get(id).audio[0].startMs;
    for (const [index, at] of [7000, 307000].entries()) {
      while (p.recorder.clock(id).timeMs < audioStart + at)
        await new Promise((r) =>
          setTimeout(r, Math.min(1000, audioStart + at - p.recorder.clock(id).timeMs)),
        );
      await observed
        .getByRole('link', { name: index === 0 ? 'Portugal' : 'España', exact: true })
        .click();
      await expect.poll(() => markers.length).toBeGreaterThan(index);
    }
    while (p.recorder.clock(id).timeMs < audioStart + 308000)
      await new Promise((r) => setTimeout(r, 100));
    await page.getByRole('button', { name: 'Stop microphone', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).microphone).toBe('STOPPED');
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).status).toBe('COMPLETED');
    const record = p.recorder.repository.get(id);
    expect(record.audio.length).toBeGreaterThan(100);
    const proof = await page.evaluate(() => sessionStorage.getItem('qa-session-proof')!);
    const onsets = await page.evaluate(
      async ({ id, audio, proof }) => {
        const buffers = [];
        for (const c of audio) {
          const r = await fetch(`/api/recordings/${id}/artifacts/${c.artifact}`, {
            headers: { 'X-QA-Session': proof },
          });
          if (!r.ok) throw new Error('Audio artifact missing');
          buffers.push(await r.arrayBuffer());
        }
        const bytes = await new Blob(buffers, { type: 'audio/webm' }).arrayBuffer();
        const decoder = new OfflineAudioContext(1, 1, 16000);
        const decoded = await decoder.decodeAudioData(bytes);
        const data = decoded.getChannelData(0);
        const result: number[] = [];
        let last = -10;
        for (let i = 0; i < data.length; i += 160) {
          let peak = 0;
          for (let j = i; j < Math.min(i + 160, data.length); j++)
            peak = Math.max(peak, Math.abs(data[j]));
          const seconds = i / decoded.sampleRate;
          if (peak > 0.04 && seconds - last > 1) {
            result.push(seconds);
            last = seconds;
          }
        }
        return result;
      },
      { id, audio: record.audio, proof },
    );
    expect(onsets).toHaveLength(2);
    expect(markers).toHaveLength(2);
    const comparisons = onsets.map((seconds, index) => ({
      audioMs: audioStart + seconds * 1000,
      browserMs: markers[index].timeMs,
      errorMs: Math.abs(audioStart + seconds * 1000 - markers[index].timeMs),
      browserUncertaintyMs: markers[index].uncertaintyMs,
    }));
    for (const c of comparisons) expect(c.errorMs).toBeLessThanOrEqual(500);
    expect(markers[1].timeMs - markers[0].timeMs).toBeGreaterThanOrEqual(299_500);
    const evidence = {
      source:
        'Web Audio synthetic MediaStream at getUserMedia boundary; actual MediaRecorder, transport and storage; physical microphone not tested',
      elapsedMs: record.durationMs,
      chunks: record.audio.length,
      comparisons,
      clockEvents: p.recorder.repository.events(id).filter((e) => e.kind === 'clock'),
      status: record.status,
    };
    writeFileSync('test-results/recording-clock-evidence.json', JSON.stringify(evidence, null, 2));
    await test.info().attach('clock-evidence', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    const audioBytes = Buffer.concat(
      record.audio.map((c) => p.recorder.repository.read(id, c.artifact).bytes),
    );
    writeFileSync('test-results/synthetic-recorded-narration.webm', audioBytes);
  } finally {
    await capture?.stop();
    await browser.close();
    await p.app.close();
    await demo.close();
  }
});
