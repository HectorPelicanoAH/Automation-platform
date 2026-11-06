import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CodexConnection,
  CODEX_VERSION,
  asObject,
  prepareCodexHome,
} from '../packages/generation/provider.ts';
import { hash } from '../packages/domain/gherkin.ts';
import { tools } from '../packages/generation/prompts.ts';

const binary = realpathSync(process.argv[2] || process.env.QA_CODEX_BINARY || 'codex');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-codex-protocol-')));
const home = join(root, 'home'),
  cwd = join(root, 'scratch');
prepareCodexHome(home);
const connection = new CodexConnection(binary, home, cwd);
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: home,
  CODEX_HOME: home,
  TMPDIR: root,
};
try {
  const version = execFileSync(binary, ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  assert.equal(version, 'codex-cli ' + CODEX_VERSION);
  execFileSync(
    binary,
    ['app-server', 'generate-json-schema', '--out', join(root, 'schema'), '--experimental'],
    { env, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const schemas: Record<string, string> = {};
  for (const [name, fields] of [
    ['ThreadStartParams', ['environments', 'dynamicTools', 'baseInstructions', 'ephemeral']],
    ['TurnStartParams', ['outputSchema', 'environments', 'sandboxPolicy']],
    ['DynamicToolCallParams', ['tool', 'arguments', 'threadId', 'turnId']],
  ] as const) {
    const bytes = readFileSync(
      join(root, 'schema', ...(name === 'DynamicToolCallParams' ? [] : ['v2']), name + '.json'),
    );
    const schema = JSON.parse(bytes.toString()) as { properties: Record<string, unknown> };
    for (const field of fields) assert.ok(field in schema.properties, name + '.' + field);
    schemas[name] = hash(bytes);
  }
  const protocol = await connection.connect();
  const account = asObject(await connection.account());
  const catalog = asObject(await connection.catalog());
  assert.equal(account.account, null, 'Isolated metadata probe must not inherit authentication');
  assert.ok(Array.isArray(catalog.data) && catalog.data.length > 0);
  const models = (catalog.data as unknown[]).map(asObject);
  const selected = models.find((m) => m.isDefault) || models[0];
  const started = asObject(
    await connection.request('thread/start', {
      cwd,
      model: selected.model,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      allowProviderModelFallback: false,
      environments: [],
      runtimeWorkspaceRoots: [],
      selectedCapabilityRoots: [],
      baseInstructions: 'Use only application-provided tools. No execution, writes or approval.',
      dynamicTools: tools.map((tool) => ({ type: 'function', ...tool })),
    }),
  );
  assert.equal(started.model, selected.model);
  assert.ok(asObject(started.thread).id);
  assert.ok(!Array.isArray(started.instructionSources) || started.instructionSources.length === 0);
  const evidence = {
    source:
      'Actual pinned Codex CLI; handshake/catalog/schema/isolated thread only, no turn, inference or credentials',
    version,
    os: process.platform,
    architecture: process.arch,
    node: process.version,
    ciCommit: process.env.GITHUB_SHA || null,
    authenticated: false,
    isolatedThreadCreatedWithoutInference: true,
    catalogModels: (catalog.data as unknown[]).length,
    catalogDoesNotVerifyEntitlement: true,
    schemaSha256: schemas,
    userAgent: String(protocol.userAgent).slice(0, 250),
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    resolve('test-results/codex-protocol-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({ status: 'PASS', version, authenticated: false, schemaFieldsVerified: true }),
  );
} finally {
  await connection.close();
  rmSync(root, { recursive: true });
}
