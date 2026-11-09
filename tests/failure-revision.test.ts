import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generationFixture, fixtureProvider, finished } from './helpers/generation.ts';
import { adviceRun, adviceReply } from './helpers/failure-advice.ts';
import { traceEvents, runTraceEvidence } from '../packages/generation/trace-evidence.ts';
import { hash } from '../packages/domain/gherkin.ts';

const pageSource = `import { expect, type Page, type Locator } from '@playwright/test';
export class CheckoutPage {
 readonly checkout: Locator;
 constructor(page: Page) { this.checkout = page.getByRole('button', { name: 'Checkout', exact: true }); }
 async submit() { await expect(this.checkout).toHaveCount(1); await this.checkout.click(); }
}`;

test('Conversation creates a separate locator-only proposal; preserves assertions, original files and exact validation gates', async () => {
  let empty = false;
  const p = generationFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      if (input.task.startsWith('Discuss'))
        return { output: adviceReply, model: 'fixture', usage: null, threadId: 'synthetic' };
      if (input.task.startsWith('Propose a minimal locator-only')) {
        assert.equal(input.files[0].content, pageSource);
        return {
          output: {
            summary:
              'Synthetic correction from observed fixture: role link, pending native validation',
            replacements: empty
              ? []
              : [
                  {
                    path: 'ui/pages/CheckoutPage.ts',
                    oldValue: 'button',
                    newValue: 'link',
                    argument: 'role',
                  },
                ],
          },
          model: 'fixture',
          usage: null,
          threadId: 'synthetic',
        };
      }
      const response = await fixtureProvider.run(request);
      if (input.task.startsWith('Plan')) {
        const output = response.output as {
          files: { path: string; content: string }[];
          plan: { files: string[] };
        };
        output.files.push({ path: 'ui/pages/CheckoutPage.ts', content: pageSource });
        output.plan.files.push('ui/pages/CheckoutPage.ts');
      }
      return response;
    },
  });
  try {
    const analysis = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: p.recordingId,
          featurePath: 'contracts/features/promotions.feature',
          sourceIds: [],
        })
      ).id,
    );
    assert.equal(analysis.status, 'SUCCEEDED', analysis.error);
    const contract = p.generation.repository.list('contracts')[0];
    p.generation.review(contract.id, {
      expectedHash: contract.hash,
      gherkin: contract.gherkin,
      answers: contract.questions.map((q) => ({ id: q.id, text: 'Confirmed synthetic datasets' })),
      approve: true,
    });
    const reviewed = p.generation.repository.get('contracts', contract.id);
    const implementation = await finished(
      p,
      (await p.generation.implement(contract.id, reviewed.hash)).id,
    );
    assert.equal(implementation.status, 'SUCCEEDED', implementation.error);
    const parent = p.generation.change(implementation.changeId!);
    const originalTarget = readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8');
    const run = adviceRun(p); // Synthetic terminal metadata, never claimed as native success.
    run.proposalId = parent.id;
    run.executableHash = 'synthetic-fingerprint';
    parent.validationRunId = run.id;
    parent.validationFingerprint = run.executableHash;
    p.store.put('runs', run);
    p.generation.repository.put('changes', parent);
    const advice = await p.generation.discussFailure(run.id, {
      message: 'Fix the locator',
      language: 'en',
      includeHealth: false,
    });
    assert.equal((await finished(p, advice.task.id)).status, 'SUCCEEDED');
    const followup = await p.generation.discussFailure(run.id, {
      message: 'A second question',
      language: 'en',
      includeHealth: false,
    });
    assert.equal((await finished(p, followup.task.id)).status, 'SUCCEEDED');
    const input = {
      expectedHash: parent.hash,
      adviceTaskId: advice.task.id,
      option: 0,
      message: 'The observed element is a link',
    };
    assert.throws(
      () => p.generation.reviseFailure(run.id, { ...input, expectedHash: '0'.repeat(64) }),
      /current failed/,
    );
    const correction = await finished(p, p.generation.reviseFailure(run.id, input).id);
    assert.equal(correction.status, 'SUCCEEDED', correction.error);
    assert.equal(p.generation.discussion(run.id).correctionTaskId, correction.id);
    const revised = p.generation.change(correction.changeId!);
    assert.notEqual(revised.id, parent.id);
    assert.equal(revised.revisionOf?.runId, run.id);
    assert.equal(revised.validationRunId, undefined);
    assert.equal(revised.validationFingerprint, undefined);
    assert.equal(revised.status, 'STAGED');
    assert.equal(
      revised.files.find((f) => f.path.endsWith('CheckoutPage.ts'))!.after,
      pageSource.replace("'button'", '"link"'),
    );
    assert.equal(p.generation.change(parent.id).hash, parent.hash);
    assert.equal(
      readFileSync(join(p.target.path, 'ui/steps/promotions.ts'), 'utf8'),
      originalTarget,
    );
    empty = true;
    const rejected = await finished(p, p.generation.reviseFailure(run.id, input).id);
    assert.equal(rejected.status, 'FAILED');
    assert.match(rejected.error!, /No evidenced locator/);
    assert.equal(p.generation.repository.list('changes').length, 2);
    run.executableHash = 'different';
    p.store.put('runs', run);
    assert.equal(p.generation.discussion(run.id).correctionSource, undefined);
    assert.throws(() => p.generation.reviseFailure(run.id, input), /current failed/);
  } finally {
    await p.app.close();
  }
});

// Minimal stored ZIP fixture, no extraction or external archiver required.
export function zipTrace(name: string, content: string) {
  const data = Buffer.from(content),
    nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + data.length, 16);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}
test('Trace evidence retains failed call/error provenance while excluding values, network and snapshot content', () => {
  const content = [
    {
      type: 'before',
      callId: 'call1',
      method: 'click',
      params: { selector: 'internal:role=button[name="Checkout"s]', value: 'private-form-value' },
      stack: [{ file: '/private/owner/file.ts', line: 7, function: 'submit' }],
    },
    { type: 'log', callId: 'call1', message: 'waiting for selector token=synthetic-secret' },
    {
      type: 'after',
      callId: 'call1',
      error: { message: 'Timeout: expected 1 element, received 0' },
    },
    { type: 'frame-snapshot', snapshot: 'private-dom-value' },
  ]
    .map((e) => JSON.stringify(e))
    .join('\n');
  const result = traceEvents(zipTrace('0-trace.trace', content));
  assert.equal(result.length, 3);
  assert.ok(JSON.stringify(result).includes('expected 1 element'));
  for (const secret of [
    'private-form-value',
    'private-dom-value',
    '/private/owner',
    'synthetic-secret',
  ])
    assert.ok(!JSON.stringify(result).includes(secret));
  assert.deepEqual(traceEvents(zipTrace('../trace.trace', content)), []);
  assert.throws(() => traceEvents(Buffer.from('not a zip')), /Invalid ZIP/);
  const archive = zipTrace('trace.trace', content);
  archive.writeUInt32LE(8_000_000, archive.length - 22 - 'trace.trace'.length - 46 + 24);
  assert.throws(() => traceEvents(archive), /budget/);
  const missing = runTraceEvidence(
    { id: 'missing', artifacts: [{ name: '../trace.zip', hash: hash('bad'), size: 1 }] } as never,
    '/tmp',
  );
  assert.equal(missing[0].status, 'UNAVAILABLE');
});

test('Saved page snapshots expire on read and their DOM/accessibility contents leave SQLite', async () => {
  const p = generationFixture();
  try {
    let record = p.recorder.repository.get(p.recordingId);
    const saved = p.recorder.repository.append(record, {
      kind: 'context',
      snapshotVersion: 1,
      provenance: 'OBSERVED',
      detail: 'Sanitized page snapshot',
      timeMs: 500,
      receivedMs: 500,
      dom: '<body>synthetic-snapshot-content</body>',
      aria: '- text: synthetic-snapshot-content',
      accessibilitySource: 'SANITIZED_DOM_RECONSTRUCTION',
    });
    assert.ok(p.recorder.repository.events(record.id)[0].dom);
    record = p.recorder.repository.get(record.id);
    record.createdAt = new Date(Date.now() - 15 * 86400000).toISOString();
    p.recorder.repository.put(record);
    const expired = p.recorder.repository.events(record.id)[0];
    assert.equal(expired.sequence, saved.sequence);
    assert.equal(expired.snapshotExpired, true);
    assert.equal(expired.dom, undefined);
    assert.equal(expired.aria, undefined);
    const row = p.store.db
      .prepare('SELECT data FROM recording_events WHERE recording_id=?')
      .get(record.id) as { data: string };
    assert.ok(!row.data.includes('synthetic-snapshot-content'));
  } finally {
    await p.app.close();
  }
});
