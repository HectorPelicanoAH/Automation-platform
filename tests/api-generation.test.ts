import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { openApiCapabilities } from '../packages/intelligence/api.ts';
import { extractCapabilities } from '../packages/intelligence/index.ts';
import { validateKarate, boundApiFeaturePath } from '../packages/generation/karate.ts';
import { coverage } from '../packages/workspace/coverage.ts';
import { hash } from '../packages/domain/gherkin.ts';
import { finished, featurePath, featureText } from './helpers/generation.ts';
import { apiFixture, reviewed, apiText, specText } from './helpers/api-generation.ts';
test('API extraction distinguishes explicit OpenAPI contracts from route-only facts and fails closed on references/auth', () => {
  const facts = openApiCapabilities(specText);
  assert.equal(facts.capabilities[0].operation?.authentication, 'none');
  assert.deepEqual(facts.capabilities[0].operation?.questions, []);
  const protectedSpec = JSON.parse(specText);
  protectedSpec.security = [{ bearer: [] }];
  const malformed = JSON.parse(specText);
  malformed.security = [null];
  assert.equal(
    openApiCapabilities(JSON.stringify(malformed)).capabilities[0].operation?.authentication,
    'unknown',
  );
  const secured = openApiCapabilities(JSON.stringify(protectedSpec)).capabilities[0].operation!;
  assert.equal(secured.authentication, 'required');
  assert.throws(
    () => validateKarate(apiText, featureText, 'api.feature', secured),
    /authentication/i,
  );
  const refSpec = JSON.parse(specText);
  refSpec.paths['/api/promotions/free-shipping'].get.responses['200'] = {
    $ref: '#/components/responses/promotion',
  };
  assert.match(
    openApiCapabilities(JSON.stringify(refSpec)).capabilities[0].operation!.questions.join(' '),
    /referenced/,
  );
  const routes = extractCapabilities(
    "import Fastify from 'fastify'; const app=Fastify();app.get('/known', async()=>({}));app.get(dynamicPath,()=>({}));",
    'server.ts',
  ).capabilities.filter((c) => c.kind === 'endpoint');
  assert.equal(routes.length, 1);
  assert.equal(routes[0].operation?.authentication, 'unknown');
});
test('API indexes cache OpenAPI and Karate without following symlinks or disabled source policies', async () => {
  const p = apiFixture();
  try {
    symlinkSync(join(p.backend.path, 'openapi.json'), join(p.backend.path, 'swagger-link.json'));
    const ref = { kind: 'source' as const, id: p.backend.id };
    const first = await p.generation.index.scan(ref),
      second = await p.generation.index.scan(ref);
    assert.equal(first.parsed, 2);
    assert.equal(second.reused, 2);
    assert.equal(second.parsed, 0);
    assert.ok(!first.files.some((f) => f.path.includes('link')));
    const doc = JSON.parse(specText);
    doc.info.version = '2.0.0';
    writeFileSync(join(p.backend.path, 'openapi.json'), JSON.stringify(doc));
    const changed = await p.generation.index.scan(ref);
    assert.equal(changed.parsed, 1);
    assert.notEqual(changed.treeHash, first.treeHash);
    p.store.put('sources', { ...p.backend, indexEnabled: false });
    assert.throws(() => p.generation.index.get(ref), /opt-in/);
  } finally {
    await p.app.close();
  }
});
test('Karate proposal preserves canonical identity, reuses an inspected helper and stages without UI dependencies', async () => {
  const p = apiFixture();
  try {
    const contract = await reviewed(p),
      endpoint = p.generation.endpoints(contract.id).find((e) => e.path === 'openapi.json')!;
    const original = readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8');
    const task = await finished(
      p,
      (await p.generation.implement(contract.id, contract.hash, { framework: 'karate', endpoint }))
        .id,
    );
    assert.equal(task.status, 'SUCCEEDED', task.error);
    const change = p.generation.change(task.changeId!);
    assert.equal(change.framework, 'karate');
    assert.ok(change.files.some((f) => f.path === 'contracts/manifest.json'));
    assert.equal(readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8'), original);
    assert.throws(() => p.generation.apply(change.id, change.hash), /validate/);
    p.generation.prepareValidation(change.id, change.hash);
    const staged = p.generation.validationTarget(change.id);
    assert.ok(existsSync(join(staged.path, 'api/gradlew')));
    assert.equal(
      hash(readFileSync(join(staged.path, 'api/gradle/wrapper/gradle-wrapper.jar'))),
      hash(readFileSync(join(p.target.path, 'api/gradle/wrapper/gradle-wrapper.jar'))),
    );
    assert.ok(!existsSync(join(staged.path, 'ui/node_modules')));
    const manifest = JSON.parse(readFileSync(join(staged.path, 'contracts/manifest.json'), 'utf8'));
    assert.equal(manifest.features[0].canonicalHash, hash(contract.gherkin));
    assert.equal(
      manifest.features[0].scenarios[0].bindings.karate.path,
      boundApiFeaturePath(original, featurePath),
    );
    assert.ok(manifest.features[0].scenarios[0].bindings.playwright);
    writeFileSync(join(p.backend.path, 'openapi.json'), specText + '\n');
    assert.throws(() => p.generation.validationTarget(change.id), /context changed/i);
  } finally {
    await p.app.close();
  }
});
test('Missing endpoint, route-only auth and stale endpoint hashes block API generation before provider execution', async () => {
  const p = apiFixture();
  try {
    const contract = await reviewed(p);
    const endpoints = p.generation.endpoints(contract.id);
    await assert.rejects(
      () => p.generation.implement(contract.id, contract.hash, { framework: 'karate' }),
      /Select a current/,
    );
    await assert.rejects(
      () =>
        p.generation.implement(contract.id, contract.hash, {
          framework: 'karate',
          endpoint: endpoints.find((e) => e.path === 'server.ts')!,
        }),
      /needs answers/,
    );
    const endpoint = endpoints.find((e) => e.path === 'openapi.json')!;
    await assert.rejects(
      () =>
        p.generation.implement(contract.id, contract.hash, {
          framework: 'karate',
          endpoint: { ...endpoint, hash: '0'.repeat(64) },
        }),
      /current discovered/,
    );
  } finally {
    await p.app.close();
  }
});
test('Karate guards reject changed endpoint, missing example and executable escape while preserving valid DSL', () => {
  const op = openApiCapabilities(specText).capabilities[0].operation!;
  assert.doesNotThrow(() => validateKarate(apiText, featureText, 'api.feature', op));
  assert.throws(
    () =>
      validateKarate(
        apiText.replace('/api/promotions/free-shipping', '/admin/delete'),
        featureText,
        'api.feature',
        op,
      ),
    /path differs/,
  );
  assert.throws(
    () => validateKarate(apiText.replace(/\s*\| pt[^\n]+/, ''), featureText, 'api.feature', op),
    /example count/,
  );
  assert.throws(
    () =>
      validateKarate(
        apiText.replace('method get', 'method delete'),
        featureText,
        'api.feature',
        op,
      ),
    /Unsupported/,
  );
  assert.throws(
    () =>
      validateKarate(
        apiText.replace(
          '    Examples:',
          "    * eval Java.type('java.lang.Runtime')\n    Examples:",
        ),
        featureText,
        'api.feature',
        op,
      ),
    /manual review/,
  );
});
test('Coverage declarations distinguish stale API bindings and never fabricate an execution', async () => {
  const p = apiFixture();
  try {
    const initial = coverage(p.workspace, p.target, [])[0];
    assert.equal(initial.frameworks[1].bindingState, 'CURRENT');
    assert.equal(initial.frameworks[1].evidence, null);
    writeFileSync(join(p.target.path, featurePath), featureText + '\n# edited contract\n');
    const current = coverage(p.workspace, p.target, [])[0];
    assert.equal(current.frameworks[1].bindingState, 'STALE_CONTRACT');
    assert.equal(current.frameworks[0].bindingState, 'CURRENT');
    assert.equal(current.frameworks[0].evidence, null);
  } finally {
    await p.app.close();
  }
});

test('API proposal cannot inject UI changes or a model-authored manifest', async () => {
  for (const escape of ['ui/steps/escape.ts', 'contracts/manifest.json']) {
    const provider = {
      async run(request: import('../packages/generation/provider.ts').AgentRequest) {
        const input = JSON.parse(request.prompt);
        if (!input.endpoint)
          return (await import('./helpers/generation.ts')).fixtureProvider.run(request);
        await request.onTool('qa_read_file', { ...input.endpoint.ref, path: input.endpoint.path });
        return {
          output: {
            plan: {
              summary: 'Untrusted escape fixture',
              reuse: [],
              files: [input.apiFeaturePath, escape],
            },
            files: [
              { path: input.apiFeaturePath, content: apiText },
              {
                path: escape,
                content: escape.endsWith('.json') ? '{}' : 'export const escape = true;',
              },
            ],
          },
          model: 'fixture-only',
          usage: null,
          threadId: 'escape',
        };
      },
    };
    const p = apiFixture(provider);
    try {
      const contract = await reviewed(p),
        endpoint = p.generation.endpoints(contract.id).find((e) => e.path === 'openapi.json')!;
      const original = readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8');
      const task = await finished(
        p,
        (
          await p.generation.implement(contract.id, contract.hash, {
            framework: 'karate',
            endpoint,
          })
        ).id,
      );
      assert.equal(task.status, 'FAILED');
      assert.match(task.error!, /framework scope/);
      assert.equal(p.generation.repository.list('changes').length, 0);
      assert.equal(readFileSync(join(p.target.path, 'contracts/manifest.json'), 'utf8'), original);
    } finally {
      await p.app.close();
    }
  }
});
test('API assertions and bound feature destination survive reuse; canonical example changes are rejected', async () => {
  const { preserveExistingCapabilities } = await import('../packages/generation/staging.ts');
  const old = readFileSync(
    'templates/automation/api/src/test/resources/features/promotions.feature',
    'utf8',
  );
  assert.doesNotThrow(() =>
    preserveExistingCapabilities(
      old,
      apiText,
      'api/src/test/resources/features/promotions.feature',
    ),
  );
  assert.throws(
    () =>
      preserveExistingCapabilities(
        old,
        old.replace('Then status 200', 'Then status 201'),
        'api/src/test/resources/features/promotions.feature',
      ),
    /assertions must be preserved/,
  );
  const operation = openApiCapabilities(specText).capabilities[0].operation!;
  assert.throws(
    () => validateKarate(apiText.replace('50€', '1€'), featureText, 'api.feature', operation),
    /canonical example/,
  );
  assert.equal(
    boundApiFeaturePath(
      readFileSync('templates/automation/contracts/manifest.json', 'utf8'),
      featurePath,
    ),
    'api/src/test/resources/features/promotions.feature',
  );
});
test('Hybrid plan uses existing API preparation and UI assertions without executing or granting writes', async () => {
  const p = apiFixture();
  try {
    const contract = await reviewed(p),
      plan = p.generation.hybridPlan(contract.id);
    assert.equal(plan.status, 'REVIEW_REQUIRED');
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      ['API_PRECONDITION', 'UI_EXECUTION', 'UI_ASSERTION'],
    );
    assert.equal(plan.steps[0].capability.symbol, 'prepareGuestContext');
    assert.equal(p.store.list('runs').length, 0);
    assert.equal(p.generation.repository.list('changes').length, 0);
    const endpoint = p.generation.endpoints(contract.id).find((e) => e.path === 'openapi.json')!;
    const task = await finished(
      p,
      (await p.generation.implement(contract.id, contract.hash, { framework: 'karate', endpoint }))
        .id,
    );
    assert.equal(task.status, 'SUCCEEDED', task.error);
    p.generation.rejectContract(contract.id);
    assert.equal(p.generation.change(task.changeId!).status, 'INVALIDATED');
    assert.throws(
      () =>
        p.generation.prepareValidation(task.changeId!, p.generation.change(task.changeId!).hash),
      /approval/,
    );
  } finally {
    await p.app.close();
  }
});

test('API generation rejects schema-only coverage that drops expected business values', () => {
  const operation = openApiCapabilities(specText).capabilities[0].operation!;
  const schemaOnly = apiText.replace(/ {4}And match response contains .*\n/, '');
  assert.throws(
    () => validateKarate(schemaOnly, featureText, 'api.feature', operation),
    /reviewed expected example/,
  );
});

test('Live API evaluation refuses missing opt-in before discovering or copying credentials', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/evaluate-api-generation.ts'],
    { encoding: 'utf8', timeout: 20000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Explicit --allow-live-model/);
  assert.doesNotMatch(result.stdout, /credentialCopyCreated|changeId/);
});

test('Inline schema extraction preserves exact immutable helper semantics and rejects weaker or dynamic helpers', async () => {
  const { equivalentSchemaAssertions } = await import('../packages/generation/karate.ts');
  const { preserveExistingCapabilities } = await import('../packages/generation/staging.ts');
  const path = 'api/src/test/resources/features/promotions.feature';
  const helperPath = 'api/src/test/resources/helpers/promotion-schema.feature';
  const before = readFileSync('templates/automation/' + path, 'utf8');
  const helper = readFileSync('templates/automation/' + helperPath, 'utf8');
  const after = before
    .replace(
      '  Background:\n',
      "  Background:\n    * def schema = call read('classpath:helpers/promotion-schema.feature')\n",
    )
    .replace(
      / {4}And match response == .*\n/,
      '    And match response == schema.promotionSchema\n',
    );
  const proofs = equivalentSchemaAssertions(before, after, new Map([[helperPath, helper]]));
  assert.equal(proofs.size, 1);
  assert.throws(
    () => preserveExistingCapabilities(before, after, path),
    /assertions must be preserved/,
  );
  assert.doesNotThrow(() => preserveExistingCapabilities(before, after, path, proofs));
  for (const unsafe of [
    helper.replace("'#string'", "'#ignore'"),
    helper + '\n    * eval something()\n',
    helper.replace("'#string'", "'#(dynamicValue)'"),
    helper.replace("'#string'", "'#number'"),
    helper.replace(/ }\n$/, ' }, shadow = {}\n'),
  ])
    assert.equal(
      equivalentSchemaAssertions(before, after, new Map([[helperPath, unsafe]])).size,
      0,
    );
  assert.equal(
    equivalentSchemaAssertions(
      before,
      after.replace('method get', 'params { x: schema.promotionSchema }\n    When method get'),
      new Map([[helperPath, helper]]),
    ).size,
    0,
  );
  assert.equal(equivalentSchemaAssertions(before, after, new Map()).size, 0);
});

test('Recorded real Codex API output passes scoped host checks without a new inference or write grant', async () => {
  const recorded = JSON.parse(
    readFileSync('docs/evaluations/fixtures/phase-4-real-output.json', 'utf8'),
  );
  const fixture = JSON.parse(
    readFileSync('docs/evaluations/fixtures/phase-4-live-v1.json', 'utf8'),
  );
  const p = apiFixture({
    async run(request) {
      const input = JSON.parse(request.prompt);
      if (!input.endpoint)
        return (await import('./helpers/generation.ts')).fixtureProvider.run(request);
      const target = input.repositories.find((r: { kind: string }) => r.kind === 'target');
      await request.onTool('qa_lookup', { query: 'promotion schema' });
      await request.onTool('qa_read_file', { ...input.endpoint.ref, path: input.endpoint.path });
      for (const path of [
        'api/src/test/resources/features/promotions.feature',
        'api/src/test/resources/helpers/promotion-schema.feature',
      ])
        await request.onTool('qa_read_file', { ...target, path });
      return {
        output: recorded,
        model: 'recorded-real-output-fixture',
        usage: null,
        threadId: 'offline-no-inference',
      };
    },
  });
  try {
    const path = join(p.target.path, 'api/src/test/resources/features/promotions.feature');
    assert.equal(hash(fixture.beforeApi), fixture.beforeApiHash);
    writeFileSync(path, fixture.beforeApi);
    const contract = await reviewed(p),
      endpoint = p.generation.endpoints(contract.id).find((e) => e.path === 'openapi.json')!;
    assert.equal(endpoint.hash, fixture.sourceSpecHash);
    const task = await finished(
      p,
      (await p.generation.implement(contract.id, contract.hash, { framework: 'karate', endpoint }))
        .id,
    );
    assert.equal(task.status, 'SUCCEEDED', task.error);
    assert.equal(task.usage, null);
    const change = p.generation.change(task.changeId!);
    assert.equal(
      change.files.find((f) => f.path.startsWith('api/'))!.after,
      recorded.files[0].content,
    );
    assert.equal(readFileSync(path, 'utf8'), fixture.beforeApi);
    assert.throws(() => p.generation.apply(change.id, change.hash), /validate/);
  } finally {
    await p.app.close();
  }
});
