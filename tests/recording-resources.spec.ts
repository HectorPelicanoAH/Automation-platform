import { test, expect } from '@playwright/test';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { BrowserCapture } from '../packages/recording/capture.ts';
import { monotonicMs, type EvidenceEvent } from '../packages/recording/model.ts';
import { policyFor } from '../packages/recording/privacy.ts';
import { generationFixture } from './helpers/generation.ts';

test('External resources and live sockets load without expanding capture or navigation grants', async () => {
  const site = Fastify(),
    resources = Fastify(),
    control = Fastify();
  let controlRequests = 0;
  control.addHook('onRequest', async () => {
    controlRequests++;
  });
  control.get('/private', async () => ({ secret: 'control-only-secret' }));
  const controlUrl = await control.listen({ host: '127.0.0.1', port: 0 });
  const sockets = new Set<Duplex>();
  resources.server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const accept = createHash('sha1')
      .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    const message = Buffer.from('socket-private-payload');
    socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
  });
  resources.get('/asset.js', async (_, reply) =>
    reply.type('application/javascript').send('window.externalScriptLoaded=true'),
  );
  resources.get('/style.css', async (_, reply) =>
    reply.type('text/css').send('#styled { color: rgb(12, 34, 56); }'),
  );
  resources.get('/image.svg', async (_, reply) =>
    reply
      .type('image/svg+xml')
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>',
      ),
  );
  resources.get('/data', async (_, reply) =>
    reply.header('Access-Control-Allow-Origin', '*').send({ value: 'api-private-payload' }),
  );
  resources.get('/frame', async (_, reply) =>
    reply.type('text/html').send('<button>External frame action</button>'),
  );
  resources.get('/elsewhere', async (_, reply) =>
    reply.type('text/html').send('Unapproved top-level destination'),
  );
  const resourceUrl = await resources.listen({ host: '127.0.0.1', port: 0 });
  site.get('/', async (_, reply) =>
    reply.type('text/html').send(`
    <link rel="stylesheet" href="${resourceUrl}/style.css">
    <script src="${resourceUrl}/asset.js"></script>
    <p id="styled">Styled content</p><img alt="External image" src="${resourceUrl}/image.svg">
    <iframe title="Embedded content" src="${resourceUrl}/frame"></iframe>
    <script>
      fetch('${resourceUrl}/data').then(r=>r.json()).then(v=>window.apiResult=v.value);
      const socket=new WebSocket('${resourceUrl.replace('http:', 'ws:')}/socket');
      socket.onmessage=e=>window.socketResult=e.data;
    </script>`),
  );
  const url = await site.listen({ host: '127.0.0.1', port: 0 });
  const events: Omit<EvidenceEvent, 'sequence' | 'receivedMs'>[] = [];
  const policy = policyFor(
    {
      url,
      allowedOrigins: [],
      screenshots: false,
      maskSelectors: [],
      sensitiveQueryKeys: [],
      retentionDays: 14,
      audioRetentionDays: 7,
      audioConsent: false,
    },
    controlUrl,
  );
  const capture = new BrowserCapture(policy, monotonicMs(), (e) => events.push(e));
  try {
    const page = await capture.start(false);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as Record<string, unknown>).externalScriptLoaded),
      )
      .toBe(true);
    await expect(page.locator('#styled')).toHaveCSS('color', 'rgb(12, 34, 56)');
    await expect
      .poll(() =>
        page.getByAltText('External image').evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBe(16);
    await expect(
      page.frameLocator('iframe').getByRole('button', { name: 'External frame action' }),
    ).toBeVisible();
    await page
      .frameLocator('iframe')
      .getByRole('button', { name: 'External frame action' })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).apiResult))
      .toBe('api-private-payload');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).socketResult))
      .toBe('socket-private-payload');
    expect(policy.allowedOrigins).toEqual([url]);
    const loadedEvidence = JSON.stringify(events);
    expect(events.filter((e) => e.kind === 'network').every((e) => e.url?.startsWith(url))).toBe(
      true,
    );
    expect(loadedEvidence).not.toContain('api-private-payload');
    expect(loadedEvidence).not.toContain('socket-private-payload');
    expect(loadedEvidence).not.toContain('External frame action');
    expect(loadedEvidence).not.toContain('Blocked unapproved origin');
    for (const origin of [controlUrl, controlUrl.replace('127.0.0.1', 'localhost')]) {
      await page.evaluate(async (origin) => {
        await fetch(origin + '/private').catch(() => {});
        await new Promise<void>((resolve) => {
          const socket = new WebSocket(origin.replace('http:', 'ws:') + '/private');
          socket.onerror = () => resolve();
          socket.onclose = () => resolve();
        });
      }, origin);
    }
    expect(controlRequests).toBe(0);
    await expect(page.goto(resourceUrl + '/elsewhere')).rejects.toThrow();
    expect(events.some((e) => e.detail.startsWith('Blocked unapproved navigation:'))).toBe(true);
    expect(events.some((e) => e.detail.startsWith('Blocked platform control origin:'))).toBe(true);
  } finally {
    await capture.stop();
    for (const socket of sockets) socket.destroy();
    await site.close();
    await resources.close();
    await control.close();
  }
});

test('No context sources: optional Workspace form and real analysis host flow use recording plus target', async ({
  page,
}) => {
  const p = generationFixture();
  // Remove the owned synthetic source registration; no application source participates in this flow.
  p.store.db.prepare('DELETE FROM sources').run();
  const base = await p.app.listen({ host: '127.0.0.1', port: 0 });
  try {
    await page.goto(base + '/#launch=' + p.launchToken);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(
      page.getByText('No context sources configured. You can continue without adding one.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Display name', { exact: true })).toBeHidden();
    await page.getByText('Add a context source (optional)', { exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Source recording', exact: true })
      .selectOption(p.recordingId);
    await page.getByRole('button', { name: 'Analyze recording', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Proposed Gherkin', exact: true })).toHaveValue(
      /Scenario Outline/,
    );
    const task = p.generation.repository.list('tasks')[0];
    expect(task.status).toBe('SUCCEEDED');
    expect(task.contextFiles.length).toBeGreaterThan(0);
    expect(task.contextFiles.every((f) => f.ref.kind === 'target')).toBe(true);
    expect(p.generation.repository.list('contracts')[0].sourceIds).toEqual([]);
    expect(p.store.list('sources')).toEqual([]);
  } finally {
    await p.app.close();
  }
});
