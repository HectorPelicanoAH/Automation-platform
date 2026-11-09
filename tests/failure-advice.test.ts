import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Store } from '../packages/storage/store.ts';
import ts from 'typescript';
import { join } from 'node:path';
import { generationFixture, finished } from './helpers/generation.ts';
import { adviceRun, adviceReply } from './helpers/failure-advice.ts';
import { validateReply } from '../packages/generation/advice.ts';
import { translate } from '../apps/web/src/locale.tsx';

test('Failure conversation scopes evidence, reuses health, preserves follow-up and never applies a repair', async () => {
  const prompts: Record<string, unknown>[] = [];
  const p = generationFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      prompts.push(input);
      assert.match(input.task, /No writes/);
      assert.equal(input.repositories.length, 1);
      await assert.rejects(
        () => request.onTool('shell', { command: 'touch forbidden' }),
        /not authorized/,
      );
      await assert.rejects(
        () =>
          request.onTool('qa_read_file', {
            kind: 'source',
            id: p.source.id,
            path: 'Promotions.tsx',
          }),
        /outside task scope/,
      );
      const result = await request.onTool('qa_lookup', { query: 'promotions' });
      assert.ok(Array.isArray(result));
      return {
        output: adviceReply,
        model: 'fixture-model',
        threadId: 'fixture-only',
        usage: { inputTokens: 10 },
      };
    },
  });
  try {
    const run = adviceRun(p);
    const file = join(p.target.path, 'ui/pages/PromotionsPage.ts');
    const original = readFileSync(file, 'utf8');
    p.evolution.health.repository.put({
      id: 'synthetic-health',
      targetId: run.targetId,
      origin: 'MANUAL',
      status: 'SUCCEEDED',
      createdAt: new Date().toISOString(),
      checks: [],
      findings: [],
    });
    const first = await p.generation.discussFailure(run.id, {
      message: 'Revisa el locator. token=synthetic-private-value',
      language: 'es',
      includeHealth: true,
    });
    assert.equal((await finished(p, first.task.id)).status, 'SUCCEEDED');
    assert.equal(prompts[0].language, 'es');
    assert.equal((prompts[0].autohealth as { id: string }).id, 'synthetic-health');
    assert.ok(!JSON.stringify(prompts[0]).includes('synthetic-private-value'));
    assert.ok(JSON.stringify(prompts[0]).includes('LOCATOR_DEFECT'));
    const second = await p.generation.discussFailure(run.id, {
      message: '¿Qué riesgo tiene esa opción?',
      language: 'es',
      includeHealth: false,
    });
    assert.equal((await finished(p, second.task.id)).status, 'SUCCEEDED');
    assert.equal((prompts[1].history as unknown[]).length, 1);
    assert.equal(prompts[1].autohealth, null);
    assert.equal(p.generation.discussion(run.id).turns.length, 2);
    assert.deepEqual(p.generation.discussion(run.id).turns[1].reply, adviceReply);
    assert.equal(p.store.list('runs').length, 1);
    assert.equal(p.generation.repository.list('changes').length, 0);
    assert.equal(readFileSync(file, 'utf8'), original);
    p.generation.repository.settings({ ...p.generation.repository.settings(), enabled: false });
    await assert.rejects(
      () =>
        p.generation.discussFailure(run.id, {
          message: 'Otra pregunta',
          language: 'es',
          includeHealth: false,
        }),
      /AI is disabled/,
    );
    assert.equal(p.generation.discussion(run.id).turns.length, 2);
    run.status = 'PASSED';
    p.store.put('runs', run);
    await assert.rejects(
      () =>
        p.generation.discussFailure(run.id, {
          message: 'Otra pregunta',
          language: 'en',
          includeHealth: false,
        }),
      /completed failed/,
    );
  } finally {
    await p.app.close();
  }
});

test('Diagnostic cancellation, invalid model output and turn limits remain explicit failures', async () => {
  let mode = 'invalid';
  const p = generationFixture({
    async run(request) {
      if (mode === 'cancel')
        await new Promise<void>((resolve) =>
          request.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      return {
        output: { summary: 'Not a valid options response' },
        model: 'fixture-model',
        threadId: 'fixture-only',
        usage: null,
      };
    },
  });
  try {
    const run = adviceRun(p);
    const input = {
      message: 'Opciones de solución',
      language: 'es' as const,
      includeHealth: false,
    };
    const first = await p.generation.discussFailure(run.id, input);
    assert.equal((await finished(p, first.task.id)).status, 'FAILED');
    assert.equal(p.generation.discussion(run.id).turns[0].reply, undefined);
    mode = 'cancel';
    const next = await p.generation.discussFailure(run.id, input);
    await assert.rejects(() => p.generation.discussFailure(run.id, input), /One AI task/);
    p.generation.cancel(next.task.id);
    assert.equal((await finished(p, next.task.id)).status, 'CANCELLED');
    const discussion = p.generation.discussion(run.id);
    discussion.turns = Array.from({ length: 20 }, () => discussion.turns[0]);
    p.generation.repository.put('discussions', discussion);
    await assert.rejects(() => p.generation.discussFailure(run.id, input), /20 turns/);
    assert.throws(
      () => validateReply({ ...adviceReply, options: Array(6).fill(adviceReply.options[0]) }),
      /Invalid diagnostic/,
    );
  } finally {
    await p.app.close();
  }
});

test('Interface catalog preserves placeholders and leaves unknown evidence unchanged', () => {
  const catalog = JSON.parse(readFileSync('apps/web/src/locales/es.json', 'utf8')) as Record<
    string,
    string
  >;
  for (const name of readdirSync('apps/web/src').filter((name) => name.endsWith('.tsx'))) {
    const source = ts.createSourceFile(
      name,
      readFileSync(join('apps/web/src', name), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const inspect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 't' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        assert.ok(
          catalog[node.arguments[0].text.trim()],
          `${name}: untranslated catalog key ${node.arguments[0].text}`,
        );
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
  for (const [key, value] of Object.entries(catalog)) {
    assert.deepEqual(
      key.match(/\{\w+\}/g)?.sort() || [],
      value.match(/\{\w+\}/g)?.sort() || [],
      key,
    );
  }
  assert.equal(translate('es', ' Workspace '), ' Espacio de trabajo ');
  assert.equal(translate('en', 'Workspace'), 'Workspace');
  assert.equal(
    translate('es', 'Edit {value0}', { value0: 'Synthetic repo' }),
    'Editar Synthetic repo',
  );
  assert.equal(translate('es', '<untrusted observed evidence>'), '<untrusted observed evidence>');
});

test('Private proposal diagnosis receives proposed files without applying or rerunning them', async () => {
  const { fixtureProvider, featurePath } = await import('./helpers/generation.ts');
  let inspected = false;
  const p = generationFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      if (!input.task.startsWith('Discuss')) return fixtureProvider.run(request);
      inspected = true;
      assert.equal(input.proposal.matchesExecutedFingerprint, true);
      assert.ok(
        input.proposal.files.some((f: { content: string }) =>
          f.content.includes('promotions.expectPromotion'),
        ),
      );
      assert.match(input.proposal.note, /not necessarily.*historical/);
      return { output: adviceReply, model: 'fixture-model', usage: null, threadId: 'fixture-only' };
    },
  });
  try {
    const a = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: p.recordingId,
          featurePath,
          sourceIds: [],
        })
      ).id,
    );
    const c = p.generation.repository.get('contracts', a.contractId!);
    const approved = p.generation.review(c.id, {
      expectedHash: c.hash,
      gherkin: c.gherkin,
      answers: c.questions.map((q) => ({ id: q.id, text: 'Confirmed synthetic fixture intent' })),
      approve: true,
    });
    const implementation = await finished(
      p,
      (await p.generation.implement(c.id, approved.hash)).id,
    );
    const change = p.generation.change(implementation.changeId!);
    change.validationFingerprint = 'synthetic-fingerprint';
    p.generation.repository.put('changes', change);
    const run = adviceRun(p);
    run.proposalId = change.id;
    run.executableHash = 'synthetic-fingerprint';
    p.store.put('runs', run);
    const task = await p.generation.discussFailure(run.id, {
      message: 'Revisar la propuesta privada',
      language: 'es',
      includeHealth: false,
    });
    assert.equal((await finished(p, task.task.id)).status, 'SUCCEEDED');
    assert.equal(inspected, true);
    assert.equal(p.generation.change(change.id).status, 'STAGED');
    assert.equal(p.store.list('runs').length, 1);
  } finally {
    await p.app.close();
  }
});

test('Existing settings default to English and the Spanish preference survives reopening SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'qa-language-'));
  const store = new Store(directory);
  store.settings({ baseUrl: 'http://127.0.0.1:4311', retentionDays: 14 });
  assert.equal(store.settings().language, 'en');
  store.settings({ ...store.settings(), language: 'es' });
  store.close();
  const reopened = new Store(directory);
  try {
    assert.equal(reopened.settings().language, 'es');
  } finally {
    reopened.close();
  }
});
