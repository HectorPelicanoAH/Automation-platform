import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CodexConnection,
  type AgentEvent,
  type AgentRequest,
} from '../packages/generation/provider.ts';
const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-provider-fixture-')));
  const binary = join(root, 'codex');
  writeFileSync(binary, readFileSync(resolve('tests/fixtures/fake-codex.mjs')), { mode: 0o700 });
  const home = join(root, 'home'),
    cwd = join(root, 'scratch');
  const connection = new CodexConnection(binary, home, cwd);
  return { root, binary, home, cwd, connection };
}
function request(prompt = 'NORMAL', signal = new AbortController().signal): AgentRequest {
  return {
    prompt,
    schema,
    model: 'fixture-model',
    effort: 'low',
    tools: [
      { name: 'qa_lookup', description: 'Fixture lookup only', inputSchema: { type: 'object' } },
    ],
    signal,
    onEvent: () => {},
    onTool: async () => ({ fixture: true }),
  };
}

test('App-server protocol fixture streams scoped tools/results/usage with isolated configuration', async () => {
  const p = fixture(),
    events: AgentEvent[] = [];
  let calls = 0;
  const result = await p.connection.run({
    ...request(),
    onEvent: (e) => events.push(e),
    onTool: async (name, args) => {
      assert.equal(name, 'qa_lookup');
      assert.deepEqual(args, { query: 'promotions' });
      calls++;
      return { fixture: true };
    },
  });
  assert.deepEqual(result.output, { answer: 'fixture-only' });
  assert.equal(calls, 1);
  assert.ok(events.some((e) => e.kind === 'tool'));
  assert.ok(events.some((e) => e.kind === 'usage'));
  assert.ok(result.usage);
  const notes = JSON.parse(readFileSync(join(p.cwd, 'fixture-process.json'), 'utf8'));
  assert.equal(notes.home, p.home);
  assert.equal(notes.hasApiKey, false);
  const rpc = readFileSync(join(p.cwd, 'fixture-rpc.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((s) => JSON.parse(s));
  const thread = rpc.find((m) => m.method === 'thread/start').params;
  assert.deepEqual(thread.environments, []);
  assert.deepEqual(thread.runtimeWorkspaceRoots, []);
  assert.equal(thread.approvalPolicy, 'never');
  assert.equal(thread.sandbox, 'read-only');
  const turn = rpc.find((m) => m.method === 'turn/start').params;
  assert.deepEqual(turn.environments, []);
  assert.deepEqual(turn.sandboxPolicy.access.readableRoots, [p.cwd]);
  assert.match(readFileSync(join(p.home, 'config.toml'), 'utf8'), /hooks = false/);
  assert.throws(() => process.kill(-notes.pid, 0));
});

test('Streaming JSON preserves UTF-8 characters split across transport chunks', async () => {
  const p = fixture();
  const result = await p.connection.run(request('UTF8'));
  assert.deepEqual(result.output, { answer: 'Envío gratis 50€' });
});

test('Unregistered provider tools fail closed and never reach the application handler', async () => {
  const p = fixture();
  let calls = 0;
  await assert.rejects(
    () =>
      p.connection.run({
        ...request('ESCAPE'),
        onTool: async () => {
          calls++;
          return {};
        },
      }),
    /Out-of-scope/,
  );
  assert.equal(calls, 0);
  const notes = JSON.parse(readFileSync(join(p.cwd, 'fixture-process.json'), 'utf8'));
  assert.throws(() => process.kill(-notes.pid, 0));
});

for (const method of ['initialize', 'turn/start'])
  test(
    'Cancelling during ' + method + ' terminates the process group without a successful result',
    async () => {
      const p = fixture(),
        abort = new AbortController();
      const work = p.connection.run(request('WAIT', abort.signal));
      const deadline = Date.now() + 5000;
      const observed = () =>
        existsSync(join(p.cwd, 'fixture-rpc.jsonl')) &&
        readFileSync(join(p.cwd, 'fixture-rpc.jsonl'), 'utf8')
          .split('\n')
          .filter(Boolean)
          .some((line) => JSON.parse(line).method === method);
      while (!observed() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
      assert.ok(observed(), 'Fixture must reach the requested protocol phase');
      const start = performance.now();
      abort.abort();
      await assert.rejects(() => work, /cancel|exited/i);
      assert.ok(performance.now() - start < 3500);
      const notes = JSON.parse(readFileSync(join(p.cwd, 'fixture-process.json'), 'utf8'));
      assert.throws(() => process.kill(-notes.pid, 0));
    },
  );
