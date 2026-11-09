import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeature } from '../packages/domain/gherkin.ts';
import { karateResults, playwrightResults, redact } from '../packages/execution/reports.ts';
import type { Run } from '../packages/domain/model.ts';

const source = readFileSync('templates/automation/contracts/features/promotions.feature', 'utf8');
test('Gherkin preserves source, explicit identity, tags and datasets on title edits', () => {
  const parsed = parseFeature(source, 'contracts/features/promotions.feature');
  assert.equal(parsed.text, source);
  assert.equal(parsed.scenarios[0].id, 'free-shipping');
  assert.equal(parsed.scenarios[0].examples.length, 2);
  assert.equal(parsed.scenarios[0].examples[1].values.promoTitle, 'Envio grátis');
  const changed = parseFeature(
    '# comment\n' + source.replace('Show the correct free shipping promotion', 'Display promotion'),
    parsed.path,
  );
  assert.equal(changed.scenarios[0].id, parsed.scenarios[0].id);
  assert.notEqual(changed.hash, parsed.hash);
});
test('Background, Rules, docstrings and multiple Examples remain intact', () => {
  const text = `# comment\nFeature: nested\n  Background:\n    Given context\n  Rule: applicable\n    @scenario:rule\n    Scenario Outline: value\n      Then a value "<value>"\n        """\n        details\n        """\n      Examples: first\n        | value |\n        | one |\n      Examples: second\n        | value |\n        | two |\n`;
  const parsed = parseFeature(text, 'rule.feature');
  assert.equal(parsed.text, text);
  assert.deepEqual(
    parsed.scenarios[0].examples.map((e) => e.values.value),
    ['one', 'two'],
  );
});
test('Invalid tables, duplicate identities and missing features cannot execute', () => {
  assert.throws(() => parseFeature('Scenario: no feature\n', 'x.feature'));
  assert.throws(() =>
    parseFeature(source.replace('| pt         | pt', '| extra | pt         | pt'), 'x.feature'),
  );
  assert.throws(() =>
    parseFeature(
      source + '\n  @scenario:free-shipping\n  Scenario: duplicate\n    Given x\n',
      'x.feature',
    ),
  );
});
const snapshot = [parseFeature(source, 'contracts/features/promotions.feature')];
const run: Pick<Run, 'snapshot'> = { snapshot };
test('Missing/malformed native reports and unexecuted results never become passes', () => {
  assert.throws(() => playwrightResults({}, run));
  assert.throws(() => karateResults({}, run));
  assert.deepEqual(playwrightResults({ suites: [] }, run), []);
  const result = karateResults(
    [{ uri: 'unknown.feature', elements: [{ id: 'unknown', name: 'unknown', steps: [] }] }],
    run,
  );
  assert.equal(result[0].status, 'UNKNOWN');
  assert.equal(result[0].scenarioId, null);
});
test('Native failure is retained with linked identity and actual steps', () => {
  const result = karateResults(
    [
      {
        uri: 'features/promotions.feature',
        elements: [
          {
            id: 'x',
            name: 'API state',
            tags: [{ name: '@scenario:free-shipping' }],
            steps: [
              {
                name: 'status 200',
                result: {
                  status: 'failed',
                  duration: 1000000,
                  error_message: 'expected 200 but 500',
                },
              },
            ],
          },
        ],
      },
    ],
    run,
  );
  assert.equal(result[0].status, 'FAILED');
  assert.equal(result[0].scenarioId, 'free-shipping');
  assert.equal(result[0].durationMs, 1);
  assert.equal(result[0].row, null);
});
test('Ordinary logs redact standard sensitive fields and bearer values', () => {
  const result = redact(
    'Authorization: Bearer token123\nCookie=private\npassword=unsafe\nother Bearer secret456\nGET /example?access_token=querySecret&country=es\n{"refresh_token":"jsonSecret"}',
  );
  for (const secret of ['token123', 'private', 'unsafe', 'secret456', 'querySecret', 'jsonSecret'])
    assert.ok(!result.includes(secret));
});

test('Nested Karate calls retain child failure evidence without double-counting time', () => {
  const result = karateResults(
    [
      {
        uri: 'features/promotions.feature',
        elements: [
          {
            id: 'nested',
            name: 'Composed API',
            tags: [{ name: '@scenario:free-shipping' }],
            steps: [
              {
                keyword: '* ',
                name: "def setup = call read('helper.feature')",
                result: { status: 'failed', duration: 5000000 },
              },
              {
                keyword: '> When ',
                name: 'method post',
                result: { status: 'passed', duration: 3000000 },
              },
              {
                keyword: '> Then ',
                name: 'status 201',
                result: {
                  status: 'failed',
                  duration: 1000000,
                  error_message: 'expected 201 but 500',
                },
              },
              { keyword: 'Then ', name: 'status 200', result: { status: 'skipped', duration: 0 } },
            ],
          },
        ],
      },
    ],
    run,
  )[0];
  assert.equal(result.durationMs, 5);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.steps.length, 4);
  assert.match(result.error!, /expected 201 but 500/);
});
