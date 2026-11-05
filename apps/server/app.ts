import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { Store } from '../../packages/storage/store.ts';
import { Workspace } from '../../packages/workspace/workspace.ts';
import { ExecutionManager } from '../../packages/execution/manager.ts';
import {
  AppError,
  type Framework,
  type Selection,
  type Source,
} from '../../packages/domain/model.ts';
import { hash, parseFeature } from '../../packages/domain/gherkin.ts';
import { fileTree, readText, replaceText } from '../../packages/workspace/files.ts';

const text = { type: 'string', minLength: 1, maxLength: 4096 };
const array = { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 256 } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const compare = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createPlatform(options: { dataDir: string; platformRoot?: string }) {
  const platformRoot = realpathSync(options.platformRoot || resolve(import.meta.dirname, '../..'));
  const store = new Store(options.dataDir);
  const workspace = new Workspace(store, platformRoot);
  const manager = new ExecutionManager(store, workspace);
  const app = Fastify({
    bodyLimit: 1_050_000,
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  });
  const launchToken = randomBytes(32).toString('hex');
  let consumed = false;
  const sessions = new Map<string, { csrf: string; proof: string; expires: number }>();
  const requestCounts = new Map<string, { since: number; count: number }>();
  const streams = new Set<import('node:http').ServerResponse>();
  const sessionFor = (cookie: string | undefined) => {
    const id = cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('qa_session='))
      ?.slice(11);
    const session = id ? sessions.get(id) : undefined;
    return session && session.expires > Date.now() ? session : undefined;
  };
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host || '';
    let parsed: URL;
    try {
      parsed = new URL('http://' + host);
    } catch {
      throw new AppError(403, 'Invalid local host');
    }
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/'
    )
      throw new AppError(403, 'Loopback host required');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    reply.header('Cache-Control', 'no-store');
    if (!request.url.startsWith('/api/')) return;
    if (request.headers.origin && request.headers.origin !== 'http://' + host)
      throw new AppError(403, 'Origin denied');
    if (request.headers['sec-fetch-site'] === 'cross-site')
      throw new AppError(403, 'Cross-site request denied');
    const previous = requestCounts.get(request.ip);
    const count =
      previous && Date.now() - previous.since < 60_000 ? previous : { since: Date.now(), count: 0 };
    requestCounts.set(request.ip, count);
    if (++count.count > 1200) throw new AppError(429, 'Local request limit reached');
    if (request.url === '/api/session') {
      if (request.method !== 'POST' || request.headers.origin !== 'http://' + host)
        throw new AppError(403, 'Same-origin launch required');
      return;
    }
    const session = sessionFor(request.headers.cookie);
    if (!session || !compare(String(request.headers['x-qa-session'] || ''), session.proof))
      throw new AppError(401, 'Open the private launch link to start a local session');
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      !compare(String(request.headers['x-qa-csrf'] || ''), session.csrf)
    )
      throw new AppError(403, 'CSRF token required');
  });
  app.setErrorHandler((error, _request, reply) => {
    const failure = error as { statusCode?: number; message?: string };
    const status = failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500;
    void reply.code(status).send({
      error:
        status < 500
          ? failure.message
          : 'Operation failed; check project prerequisites and permissions',
    });
  });
  app.post<{ Body: { token: string } }>(
    '/api/session',
    { schema: { body: object({ token: text }) } },
    async (request, reply) => {
      if (consumed || !compare(request.body.token, launchToken))
        throw new AppError(
          403,
          'Launch link expired or invalid; restart the platform for a new link',
        );
      consumed = true;
      const id = randomBytes(32).toString('hex');
      const proof = randomBytes(32).toString('hex');
      sessions.set(id, {
        csrf: randomBytes(32).toString('hex'),
        proof,
        expires: Date.now() + 12 * 60 * 60 * 1000,
      });
      reply.header(
        'Set-Cookie',
        `qa_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
      );
      return { ok: true, proof };
    },
  );
  app.get('/api/state', async (request) => ({
    csrf: sessionFor(request.headers.cookie)!.csrf,
    sources: store.list('sources'),
    targets: store.list('targets'),
    runs: store.list('runs').reverse(),
    settings: store.settings(),
    versions: {
      node: process.version,
      sqlite: (store.db.prepare('SELECT sqlite_version() version').get() as { version: string })
        .version,
    },
    capabilities: { phase: 1, recording: false, ai: false, indexing: false, rowSelection: false },
  }));
  app.put<{ Body: { baseUrl: string; retentionDays: number } }>(
    '/api/settings',
    {
      schema: {
        body: object({
          baseUrl: text,
          retentionDays: { type: 'integer', minimum: 1, maximum: 3650 },
        }),
      },
    },
    async (request) => {
      let url: URL;
      try {
        url = new URL(request.body.baseUrl);
      } catch {
        throw new AppError(400, 'Invalid environment URL');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new AppError(400, 'Use an HTTP(S) URL without credentials');
      return store.settings(request.body);
    },
  );
  app.post<{
    Body: Pick<
      Source,
      'name' | 'path' | 'kind' | 'preferredRef' | 'enabled' | 'indexEnabled' | 'include' | 'exclude'
    >;
  }>(
    '/api/sources',
    {
      schema: {
        body: object({
          name: text,
          path: text,
          kind: { enum: ['frontend', 'backend', 'shared', 'other'] },
          preferredRef: { type: 'string', maxLength: 256 },
          enabled: { type: 'boolean' },
          indexEnabled: { type: 'boolean' },
          include: array,
          exclude: array,
        }),
      },
    },
    async (request) => workspace.addSource(request.body),
  );
  app.patch<{
    Params: { id: string };
    Body: {
      enabled: boolean;
      indexEnabled: boolean;
      include: string[];
      exclude: string[];
      preferredRef: string;
      name: string;
    };
  }>(
    '/api/sources/:id',
    {
      schema: {
        body: object({
          enabled: { type: 'boolean' },
          indexEnabled: { type: 'boolean' },
          include: array,
          exclude: array,
          preferredRef: { type: 'string', maxLength: 256 },
          name: text,
        }),
      },
    },
    async (request) => {
      const source = store.get('sources', request.params.id);
      if (!source) throw new AppError(404, 'Source not found');
      Object.assign(source, request.body);
      store.put('sources', source);
      return source;
    },
  );
  app.post<{ Body: { path: string; name: string; mode: 'initialize' | 'import' } }>(
    '/api/targets',
    {
      schema: {
        body: object({ path: text, name: text, mode: { enum: ['initialize', 'import'] } }),
      },
    },
    async (request) =>
      request.body.mode === 'initialize'
        ? workspace.initialize(request.body.path, request.body.name)
        : workspace.importTarget(request.body.path, request.body.name),
  );
  app.get<{ Params: { id: string } }>('/api/targets/:id/trust', async (request) => {
    const target = workspace.target(request.params.id);
    return {
      fingerprint: workspace.fingerprint(target),
      trusted: target.trustFingerprint === workspace.fingerprint(target),
      warning:
        'Tests and configs execute code with your OS permissions. Only trust repositories you have reviewed. Process workers are not security sandboxes.',
    };
  });
  app.post<{ Params: { id: string }; Body: { fingerprint: string } }>(
    '/api/targets/:id/trust',
    { schema: { body: object({ fingerprint: text }) } },
    async (request) => {
      const target = workspace.target(request.params.id);
      if (request.body.fingerprint !== workspace.fingerprint(target))
        throw new AppError(409, 'Project changed; review current fingerprint');
      target.trustFingerprint = request.body.fingerprint;
      store.put('targets', target);
      return target;
    },
  );
  app.get<{ Params: { id: string } }>('/api/targets/:id/features', async (request) =>
    workspace.features(workspace.target(request.params.id)),
  );
  app.get<{ Params: { id: string } }>('/api/targets/:id/tree', async (request) =>
    fileTree(workspace.target(request.params.id).path),
  );
  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/api/targets/:id/file',
    { schema: { querystring: object({ path: text }) } },
    async (request) => readText(workspace.target(request.params.id).path, request.query.path),
  );
  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/api/targets/:id/draft',
    { schema: { querystring: object({ path: text }) } },
    async (request) => {
      workspace.target(request.params.id);
      return { text: store.draft(request.params.id, request.query.path) ?? null };
    },
  );
  app.put<{
    Params: { id: string };
    Body: { path: string; text: string; baseHash: string; save: boolean };
  }>(
    '/api/targets/:id/feature',
    {
      schema: {
        body: object({
          path: text,
          text: { type: 'string', maxLength: 1_000_000 },
          baseHash: text,
          save: { type: 'boolean' },
        }),
      },
    },
    async (request) => {
      const target = workspace.target(request.params.id);
      const body = request.body;
      if (!body.path.startsWith('contracts/features/') || !body.path.endsWith('.feature'))
        throw new AppError(403, 'Only canonical feature editing is available');
      readText(target.path, body.path);
      store.draft(target.id, body.path, body.text);
      const parsed = parseFeature(body.text, body.path);
      if (body.save) {
        if (manager.busyTarget(target.id))
          throw new AppError(409, 'Wait for queued/running tests before changing their contract');
        writeFileSync(
          join(store.directory, 'save-intent.json'),
          JSON.stringify({
            targetId: target.id,
            path: body.path,
            baseHash: body.baseHash,
            text: body.text,
          }),
          { mode: 0o600 },
        );
        replaceText(target.path, body.path, body.baseHash, body.text);
        writeFileSync(
          join(store.directory, 'save-intent.json'),
          JSON.stringify({ completed: true }),
          { mode: 0o600 },
        );
      }
      return { ...parsed, saved: body.save };
    },
  );
  app.post<{
    Body: {
      targetId: string;
      framework: Framework;
      selection: Selection;
      baseUrl: string;
      idempotencyKey: string;
    };
  }>(
    '/api/runs',
    {
      schema: {
        body: object({
          targetId: text,
          framework: { enum: ['playwright', 'karate'] },
          selection: object(
            {
              kind: { enum: ['suite', 'feature', 'scenario', 'tags'] },
              value: { type: 'string', maxLength: 256 },
            },
            ['kind'],
          ),
          baseUrl: text,
          idempotencyKey: text,
        }),
      },
    },
    async (request) => manager.create(request.body),
  );
  app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (request) =>
    manager.cancel(request.params.id),
  );
  app.get<{ Params: { id: string } }>('/api/runs/:id/log', async (request) => ({
    text: manager.log(request.params.id),
  }));
  app.get<{ Params: { id: string }; Querystring: { name: string } }>(
    '/api/runs/:id/artifact',
    { schema: { querystring: object({ name: text }) } },
    async (request, reply) => {
      const run = store.get('runs', request.params.id);
      if (!run || !run.artifacts.some((a) => a.name === request.query.name))
        throw new AppError(404, 'Artifact not found');
      const file = readTextArtifact(manager.directory(run.id), request.query.name);
      if (hash(file) !== run.artifacts.find((a) => a.name === request.query.name)!.hash)
        throw new AppError(409, 'Artifact changed after collection');
      reply.header('Content-Disposition', 'attachment; filename="artifact"');
      reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
      return reply.type('application/octet-stream').send(file);
    },
  );
  app.get<{ Querystring: { targetId?: string } }>('/api/readiness', async (request) => {
    const target = request.query.targetId ? workspace.target(request.query.targetId) : undefined;
    let java = 'Java unavailable';
    const result = spawnSync(
      process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java',
      ['-version'],
      { timeout: 3000, encoding: 'utf8' },
    );
    java = result.stderr || result.stdout || java;
    return [
      ...workspace.readiness(target),
      {
        name: 'Chromium',
        ready: existsSync(chromium.executablePath()),
        detail: existsSync(chromium.executablePath())
          ? 'Installed'
          : 'Run pnpm exec playwright install chromium',
      },
      { name: 'Java 21', ready: /version "21\./.test(java), detail: java.split('\n')[0] },
    ];
  });
  app.get<{ Querystring: { after?: string } }>('/api/events', async (request, reply) => {
    let cursor = Number(request.headers['last-event-id'] || request.query.after || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      throw new AppError(400, 'Invalid event cursor');
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const timer = setInterval(() => {
      for (const row of store.events(cursor)) {
        reply.raw.write(`id: ${row.seq}\ndata: ${row.data}\n\n`);
        cursor = row.seq;
      }
      reply.raw.write(': heartbeat\n\n');
    }, 500);
    reply.raw.on('close', () => {
      clearInterval(timer);
      streams.delete(reply.raw);
    });
  });
  if (existsSync(join(platformRoot, 'apps/web/dist/index.html'))) {
    void app.register(fastifyStatic, {
      root: join(platformRoot, 'apps/web/dist'),
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Endpoint not found' })
        : reply
            .type('text/html')
            .send(readFileSync(join(platformRoot, 'apps/web/dist/index.html'))),
    );
  }
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
    await manager.shutdown();
  });
  app.addHook('onClose', async () => {
    store.close();
  });
  return { app, store, workspace, manager, launchToken };
}

function readTextArtifact(root: string, path: string) {
  const file = resolve(root, path);
  if (!file.startsWith(root + '/') || realpathSync(file) !== file)
    throw new AppError(403, 'Artifact path denied');
  return readFileSync(file);
}
