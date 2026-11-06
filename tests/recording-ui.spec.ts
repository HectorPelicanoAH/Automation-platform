import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatform } from '../apps/server/app.ts';
import { demoApp } from '../apps/demo/app.ts';
import { BrowserCapture } from '../packages/recording/capture.ts';
import { monotonicMs, type EvidenceEvent, type AudioChunk } from '../packages/recording/model.ts';

async function decodeRecordedAudio(page: Page, id: string, audio: AudioChunk[]) {
  const proof = await page.evaluate(() => sessionStorage.getItem('qa-session-proof')!);
  return await page.evaluate(
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
      return {
        onsets: result,
        durationSeconds: decoded.duration,
        sampleRate: decoded.sampleRate,
      };
    },
    { id, audio, proof },
  );
}

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream'] } });

test('Record UI: real worker, denied microphone, manual revisions, cancellation and restart', async ({
  page,
  context,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'qa-record-ui-'));
  let p = createPlatform({ dataDir: join(root, 'private') });
  const demo = demoApp();
  const demoUrl = await demo.listen({ host: '127.0.0.1', port: 0 });
  let releaseFirstSave = () => {};
  const firstSaveResponse = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });
  let gateFirstSave = true;
  p.app.addHook('onSend', async (req, _reply, payload) => {
    if (gateFirstSave && req.method === 'PUT' && req.url.endsWith('/transcript')) {
      gateFirstSave = false;
      await firstSaveResponse;
    }
    return payload;
  });
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
    releaseFirstSave();
    await page.getByRole('button', { name: 'Save transcript revision' }).click();
    await expect.poll(() => p.recorder.repository.get(id).transcript.length).toBe(2);
    // Explicit lost-producer metadata fixture, not a claim that a physical microphone was captured.
    p.recorder.microphone(id, 'RECORDING');
    await page.reload();
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByRole('button', { name: 'Stop microphone', exact: true }).click();
    await expect.poll(() => p.recorder.repository.get(id).microphone).toBe('ERROR');
    expect(
      p.recorder.repository
        .events(id)
        .some((e) => e.kind === 'gap' && e.detail.includes('Microphone capture error')),
    ).toBe(true);
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
    releaseFirstSave();
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
        // Pinned-Chromium test fixture only: timestamped frames avoid a virtual output-device clock.
        const Generator = (
          globalThis as unknown as {
            MediaStreamTrackGenerator: new (options: {
              kind: string;
            }) => MediaStreamTrack & { writable: WritableStream<AudioData> };
          }
        ).MediaStreamTrackGenerator;
        if (!Generator) throw new Error('Synthetic frame source unavailable in pinned Chromium');
        const track = new Generator({ kind: 'audio' });
        const writer = track.writable.getWriter();
        const rate = 48000;
        const begin = performance.now();
        let sample = 0;
        let maxProducerLagMs = 0;
        let producerError = '';
        Object.defineProperty(navigator.mediaDevices, 'qaSyntheticProbe', {
          configurable: true,
          value: () => ({
            state: track.readyState,
            sampleRate: rate,
            sourceSeconds: sample / rate,
            wallSeconds: (performance.now() - begin) / 1000,
            maxProducerLagMs,
            producerError,
            track: track.getSettings(),
          }),
        });
        void (async () => {
          try {
            while (track.readyState === 'live') {
              const target = Math.floor(((performance.now() - begin) * rate) / 1000);
              while (sample + 480 <= target && track.readyState === 'live') {
                const data = new Float32Array(480);
                for (let i = 0; i < data.length; i++) {
                  const t = (sample + i) / rate;
                  if ((t >= 7 && t < 7.2) || (t >= 307 && t < 307.2))
                    data[i] = 0.4 * Math.sin(2 * Math.PI * 880 * t);
                }
                maxProducerLagMs = Math.max(
                  maxProducerLagMs,
                  performance.now() - begin - ((sample + 480) / rate) * 1000,
                );
                const frame = new AudioData({
                  format: 'f32-planar',
                  sampleRate: rate,
                  numberOfChannels: 1,
                  numberOfFrames: 480,
                  timestamp: (sample / rate) * 1e6,
                  data,
                });
                try {
                  await writer.write(frame);
                } finally {
                  frame.close();
                }
                sample += 480;
              }
              await new Promise((r) => setTimeout(r, 20));
            }
          } catch (error) {
            if (track.readyState === 'live') {
              producerError = String(error);
              track.stop();
            }
          } finally {
            await writer.close().catch(() => {});
          }
        })();
        return new MediaStream([track]);
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
    await expect
      .poll(() => p.recorder.repository.get(id).audio.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    const preflightRecord = p.recorder.repository.get(id);
    const preflight = await decodeRecordedAudio(page, id, preflightRecord.audio);
    const sourceProbe = await page.evaluate(() => {
      const media = navigator.mediaDevices as MediaDevices & { qaSyntheticProbe: () => unknown };
      return media.qaSyntheticProbe();
    });
    const preflightWallMs = preflightRecord.audio.at(-1)!.endMs - preflightRecord.audio[0].startMs;
    writeFileSync(
      'test-results/recording-source-diagnostic.json',
      JSON.stringify({ preflight, sourceProbe, preflightWallMs }, null, 2),
    );
    expect(
      Math.abs(preflight.durationSeconds * 1000 - preflightWallMs),
      'Synthetic PCM duration must match real capture time',
    ).toBeLessThan(500);

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
    const decodedAudio = await decodeRecordedAudio(page, id, record.audio);
    const finalSourceProbe = await page.evaluate(() => {
      const media = navigator.mediaDevices as MediaDevices & {
        qaSyntheticProbe: () => { maxProducerLagMs: number; producerError: string };
      };
      return media.qaSyntheticProbe();
    });
    const onsets = decodedAudio.onsets;
    writeFileSync(
      'test-results/recording-clock-diagnostic.json',
      JSON.stringify(
        {
          decodedAudio,
          finalSourceProbe,
          elapsedMs: record.durationMs,
          audioStart,
          chunks: record.audio,
          markers,
        },
        null,
        2,
      ),
    );
    const retainedAudio = Buffer.concat(
      record.audio.map((c) => p.recorder.repository.read(id, c.artifact).bytes),
    );
    writeFileSync('test-results/synthetic-recorded-narration.webm', retainedAudio);
    expect(
      Math.abs(decodedAudio.durationSeconds * 1000 - (record.audio.at(-1)!.endMs - audioStart)),
      'Continuous PCM must preserve the real five-minute span',
    ).toBeLessThan(500);
    expect(finalSourceProbe.producerError).toBe('');
    expect(
      finalSourceProbe.maxProducerLagMs,
      'Synthetic source must be delivered in real time',
    ).toBeLessThan(500);
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
        'Timestamped synthetic PCM MediaStream at getUserMedia boundary; actual MediaRecorder, transport and storage; physical microphone not tested',
      os: process.platform,
      architecture: process.arch,
      node: process.version,
      syntheticSource: 'Chromium MediaStreamTrackGenerator, 48000 Hz f32-planar, 10 ms frames',
      ciCommit: process.env.GITHUB_SHA || null,
      finalSourceProbe,
      decodedDurationSeconds: decodedAudio.durationSeconds,
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
  } finally {
    await capture?.stop();
    await browser.close();
    await p.app.close();
    await demo.close();
  }
});
