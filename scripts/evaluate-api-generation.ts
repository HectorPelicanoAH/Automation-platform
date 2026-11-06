// Opt-in synthetic live proposal only. No credential discovery, native execution, application or skill activation.
import assert from 'node:assert/strict';
import {
  copyFileSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { CodexConnection, prepareCodexHome } from '../packages/generation/provider.ts';
import { apiFixture, reviewed } from '../tests/helpers/api-generation.ts';
const { values } = parseArgs({
  options: {
    'allow-live-model': { type: 'boolean' },
    binary: { type: 'string' },
    'auth-file': { type: 'string' },
    model: { type: 'string' },
    'candidate-skill': { type: 'boolean' },
  },
});
if (!values['allow-live-model'] || !values.binary || !values['auth-file'] || !values.model)
  throw new Error(
    'Explicit --allow-live-model --binary <canonical executable> --auth-file <canonical file> --model <id> required. May consume account quota. Produces a synthetic proposal only.',
  );
const regular = (path: string) => {
  if (
    !isAbsolute(path) ||
    realpathSync(path) !== path ||
    lstatSync(path).isSymbolicLink() ||
    !lstatSync(path).isFile()
  )
    throw new Error('Use canonical regular files without symlinks');
  return path;
};
const binary = regular(values.binary),
  auth = regular(values['auth-file']);
const { readFileSync } = await import('node:fs');
const skill = values['candidate-skill']
  ? readFileSync('docs/skills/candidates/v1/implement-karate/SKILL.md', 'utf8')
  : '';
const p = apiFixture({
  async run(request) {
    const input = JSON.parse(request.prompt);
    // The canonical contract is predefined synthetic input, not a claim of real recording/model analysis.
    if (!input.endpoint)
      return (await import('../tests/helpers/generation.ts')).fixtureProvider.run(request);
    const client = new CodexConnection(binary, p.generation.home, join(p.root, 'turn'));
    return client.run({
      ...request,
      prompt: skill
        ? 'Evaluation-only inactive candidate, no grants:\n' +
          skill +
          '\nTask input:\n' +
          request.prompt
        : request.prompt,
    });
  },
});
let copied = false;
try {
  p.generation.configure(
    {
      enabled: true,
      binary,
      analysisModel: values.model,
      implementationModel: values.model,
      analysisEffort: 'low',
      implementationEffort: 'medium',
    },
    true,
  );
  prepareCodexHome(p.generation.home);
  copyFileSync(auth, join(p.generation.home, 'auth.json'), constants.COPYFILE_EXCL);
  copied = true;
  chmodSync(join(p.generation.home, 'auth.json'), 0o600);
  const contract = await reviewed(p);
  const endpoint = p.generation.endpoints(contract.id).find((e) => e.path === 'openapi.json')!;
  const started = await p.generation.implement(contract.id, contract.hash, {
    framework: 'karate',
    endpoint,
  });
  // Live calls have the existing five-minute manager limit; the fixture helper's short timeout is not used.
  let task = p.generation.repository.get('tasks', started.id);
  while (['RUNNING', 'CANCEL_REQUESTED'].includes(task.status)) {
    await new Promise((r) => setTimeout(r, 250));
    task = p.generation.repository.get('tasks', started.id);
  }
  const proposal = task.changeId ? p.generation.change(task.changeId) : null;
  const result = {
    source:
      'Real Codex API implementation; predefined synthetic canonical contract and QA approval actor, fixture-only contract initialization',
    candidateSkill: values['candidate-skill'] || false,
    activation: 'NOT_APPROVED',
    task,
    proposal,
    nativeValidation: 'NOT_RUN',
    application: 'NOT_APPLIED',
  };
  const evidence = join(p.root, 'live-api-evidence.json');
  writeFileSync(evidence, JSON.stringify(result, null, 2), { mode: 0o600 });
  if (proposal) writeFileSync(join(p.root, 'review.diff'), proposal.diff, { mode: 0o600 });
  console.log(
    JSON.stringify({
      root: p.root,
      evidence,
      status: task.status,
      error: task.error,
      changeId: proposal?.id,
      reviewDiff: proposal ? join(p.root, 'review.diff') : null,
      usage: task.usage,
    }),
  );
  assert.equal(task.status, 'SUCCEEDED', task.error);
  assert.ok(proposal?.apiEndpoint);
} finally {
  p.generation.configure({ ...p.generation.repository.settings(), enabled: false }, false);
  await p.app.close();
  if (existsSync(p.generation.home)) rmSync(p.generation.home, { recursive: true });
  console.log(
    JSON.stringify({
      credentialCopyRemoved: !existsSync(p.generation.home),
      credentialCopyCreated: copied,
      aiDisabled: true,
    }),
  );
}
// Keep the proposal and synthetic target for explicit review; never execute or apply it here.
