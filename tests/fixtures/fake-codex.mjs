#!/usr/bin/env node
// Deterministic protocol fixture. No model, authentication or network is used.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers';
if (process.argv.includes('--version')) {
  process.stdout.write('codex-cli 0.162.0-alpha.2\n');
  process.exit(0);
}
writeFileSync(
  join(process.cwd(), 'fixture-process.json'),
  JSON.stringify({
    pid: process.pid,
    home: process.env.HOME,
    codexHome: process.env.CODEX_HOME,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  }),
);
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const threadId = 'fixture-thread',
  turnId = 'fixture-turn';
let unicode = false;
async function complete() {
  send({
    method: 'item/agentMessage/delta',
    params: { threadId, delta: '{"answer":"fixture-only"}' },
  });
  send({
    method: 'thread/tokenUsage/updated',
    params: {
      threadId,
      turnId,
      tokenUsage: {
        total: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
        last: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      },
    },
  });
  const message = {
    method: 'item/completed',
    params: {
      threadId,
      item: {
        type: 'agentMessage',
        text: JSON.stringify({ answer: unicode ? 'Envío gratis 50€' : 'fixture-only' }),
      },
    },
  };
  if (unicode) {
    const bytes = Buffer.from(JSON.stringify(message) + '\n');
    const split = bytes.indexOf(Buffer.from('€')) + 1;
    process.stdout.write(bytes.subarray(0, split));
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.stdout.write(bytes.subarray(split));
  } else send(message);
  send({
    method: 'turn/completed',
    params: { threadId, turn: { id: turnId, status: 'completed' } },
  });
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  appendFileSync(join(process.cwd(), 'fixture-rpc.jsonl'), JSON.stringify(m) + '\n');
  if (m.id === 700 && !m.method) {
    void complete();
    return;
  }
  if (m.method === 'initialize')
    send({ id: m.id, result: { userAgent: 'explicit-protocol-fixture' } });
  if (m.method === 'permissionProfile/list')
    send({ id: m.id, result: { data: [{ id: 'qa-proposals', allowed: true }], nextCursor: null } });
  if (m.method === 'account/read') send({ id: m.id, result: { account: null } });
  if (m.method === 'model/list')
    send({
      id: m.id,
      result: {
        data: [{ model: 'fixture-model', isDefault: true, displayName: 'Protocol fixture' }],
      },
    });
  if (m.method === 'thread/start')
    send({
      id: m.id,
      result: { model: m.params.model, instructionSources: [], thread: { id: threadId } },
    });
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: turnId } } });
    const text = m.params.input[0].text;
    unicode = text === 'UTF8';
    if (text === 'WAIT') return;
    setTimeout(
      () =>
        send({
          id: 700,
          method: 'item/tool/call',
          params: {
            threadId,
            turnId,
            callId: 'fixture-call',
            tool: text === 'ESCAPE' ? 'arbitrary_shell' : 'qa_lookup',
            namespace: null,
            arguments: { query: 'promotions' },
          },
        }),
      10,
    );
  }
  if (m.method === 'turn/interrupt') {
    send({ id: m.id, result: {} });
    send({
      method: 'turn/completed',
      params: { threadId, turn: { id: turnId, status: 'interrupted' } },
    });
  }
});
