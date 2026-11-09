import { test, expect } from '@playwright/test';
import { generationFixture } from './helpers/generation.ts';

test('Recording requests stay idle between actions, supervise active sessions across views and drain final evidence', async ({
  page,
}) => {
  const p = generationFixture();
  const record = p.recorder.repository.get(p.recordingId);
  for (let i = 0; i < 600; i++)
    p.recorder.repository.append(record, {
      kind: 'marker',
      detail: `Polling fixture event ${i}`,
      timeMs: i,
      receivedMs: i,
      provenance: 'OBSERVED',
    });
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  let listRequests = 0,
    detailRequests = 0,
    generationRequests = 0;
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  page.on('request', (req) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/recordings') listRequests++;
    if (path === '/api/recordings/' + record.id) detailRequests++;
    if (path === '/api/generation/state') generationRequests++;
  });
  const counts = () => ({ listRequests, detailRequests, generationRequests });
  const barrier = () =>
    page.evaluate(async () => {
      // Flush actual HTTP work after advancing only the control page's timers.
      await fetch('/api/state', {
        headers: { 'X-QA-Session': sessionStorage.getItem('qa-session-proof')! },
      });
    });
  const assertIdle = async () => {
    const before = counts();
    await page.clock.fastForward(5000);
    await barrier();
    expect(counts()).toEqual(before);
  };
  try {
    await page.clock.install();
    await page.goto(base + '/#launch=' + p.launchToken);
    await expect.poll(() => listRequests).toBe(1);
    await barrier();
    await assertIdle();
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByLabel('Recording session').selectOption(record.id);
    await expect(page.getByRole('button', { name: /Polling fixture event/ })).toHaveCount(600);
    expect(detailRequests).toBe(3); // All three terminal pages, no recurring history fetch.
    await assertIdle();
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await assertIdle();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByLabel('Source recording').locator(`option[value="${record.id}"]`),
    ).toHaveCount(1);
    await assertIdle();
    // Controlled persisted metadata fixture, not a claim that a native worker or microphone ran.
    const live = p.recorder.repository.get(record.id);
    live.status = 'RECORDING';
    p.recorder.repository.put(live);
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByText(/● Recording:/)).toBeVisible();
    await barrier();
    const during = counts();
    await page.clock.fastForward(1100);
    await expect.poll(() => detailRequests).toBeGreaterThan(during.detailRequests);
    await barrier();
    expect(listRequests).toBe(during.listRequests);
    const ended = p.recorder.repository.get(record.id);
    ended.status = 'COMPLETED';
    p.recorder.repository.append(ended, {
      kind: 'marker',
      detail: 'Final event after leaving Record',
      timeMs: 601,
      receivedMs: 601,
      provenance: 'OBSERVED',
    });
    await page.clock.fastForward(1100);
    await expect(page.getByText(/● Recording:/)).toHaveCount(0);
    await expect(
      page.getByLabel('Source recording').locator(`option[value="${record.id}"]`),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /Final event after leaving Record/, includeHidden: true }),
    ).toHaveCount(1);
    await barrier();
    await assertIdle();
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByRole('button', { name: /Polling fixture event/ })).toHaveCount(600);
    await barrier();
    await assertIdle();
    const resume = p.recorder.repository.get(record.id);
    resume.status = 'RECORDING';
    p.recorder.repository.put(resume);
    await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
    await page.route(`**/api/recordings/${record.id}?*`, (route) => route.abort());
    await page.clock.fastForward(1100);
    await expect(page.getByRole('alert')).toContainText(/fetch|NetworkError/i);
    await assertIdle();
    await page.unroute(`**/api/recordings/${record.id}?*`);
    const finish = p.recorder.repository.get(record.id);
    finish.status = 'COMPLETED';
    p.recorder.repository.put(finish);
    await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
    await barrier();
    await assertIdle();
    expect(browserErrors).toEqual([]);
  } finally {
    await p.app.close();
  }
});
