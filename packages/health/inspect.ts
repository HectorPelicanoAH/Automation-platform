import ts from 'typescript';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator, type FeatureChild } from '@cucumber/messages';
import { hash, parseFeature } from '../domain/gherkin.ts';
import type { Finding } from './model.ts';
import type { RepositoryIndex } from '../intelligence/index.ts';
import type { Run } from '../domain/model.ts';
import { safeText } from '../recording/privacy.ts';
import { redact } from '../execution/reports.ts';
const clean = (text: string) => safeText(redact(text)).slice(0, 2000);
export const finding = (
  code: string,
  root: string,
  severity: Finding['severity'],
  evidence: string[],
  action: string,
  location = '',
  confidence: Finding['confidence'] = 'DETERMINISTIC',
): Finding => ({
  fingerprint: hash(JSON.stringify([code, root, location])),
  code,
  root,
  severity,
  confidence,
  evidence: evidence.map(clean),
  action,
});
const gherkinStepTexts = (text: string) => {
  const doc = new Parser(
    new AstBuilder(IdGenerator.incrementing()),
    new GherkinClassicTokenMatcher(),
  ).parse(text);
  const result: string[] = [];
  const visit = (children: readonly FeatureChild[]) => {
    for (const c of children) {
      if (c.rule) visit(c.rule.children);
      for (const s of c.scenario?.steps || c.background?.steps || [])
        result.push(s.text.replace(/"[^"]*"|'[^']*'/g, '{string}').replace(/\b\d+\b/g, '{int}'));
    }
  };
  if (doc.feature) visit(doc.feature.children);
  return result;
};
export function inspectAutomation(
  root: string,
  files: { path: string; text: string }[],
  index: RepositoryIndex | undefined,
  runs: Run[],
  slowSetupMs: number,
) {
  const findings: Finding[] = [],
    scenarios = new Map<string, string[]>(),
    steps = new Set<string>();
  for (const f of files.filter((f) => /^contracts\/features\/.*\.feature$/.test(f.path))) {
    try {
      const feature = parseFeature(f.text, f.path);
      gherkinStepTexts(f.text).forEach((s) => steps.add(s));
      for (const s of feature.scenarios) {
        const key = s.id.startsWith('unmapped:') ? 'name:' + s.name : s.id;
        scenarios.set(key, [...(scenarios.get(key) || []), f.path + ':' + s.line]);
        if (s.id.startsWith('unmapped:'))
          findings.push(
            finding(
              'UNMAPPED_SCENARIO',
              root,
              'WARNING',
              [
                f.path + ':' + s.line,
                'No explicit @scenario identity; runner traceability is incomplete.',
              ],
              'Assign a reviewed unique scenario identity.',
              f.path + ':' + s.line,
            ),
          );
      }
    } catch (error) {
      findings.push(
        finding(
          'INVALID_GHERKIN',
          root,
          'ERROR',
          [f.path, error instanceof Error ? error.message : 'Invalid feature'],
          'Correct the feature with the official parser; preserve reviewed intent.',
          f.path,
        ),
      );
    }
  }
  for (const [key, locations] of scenarios)
    if (locations.length > 1)
      findings.push(
        finding(
          'DUPLICATE_GHERKIN',
          root,
          'ERROR',
          [key, ...locations],
          'Review duplicate scenario identities/definitions before execution.',
          key,
        ),
      );
  for (const f of files) {
    if (/ui\/(pages|components)\/.*\.tsx?$/.test(f.path)) {
      if (
        /waitForTimeout\s*\(|force\s*:\s*true|xpath\s*=|\/html\/|\.nth\s*\(|\.first\s*\(|\.locator\s*\(/.test(
          f.text,
        )
      )
        findings.push(
          finding(
            'BRITTLE_SELECTOR_CANDIDATE',
            root,
            'WARNING',
            [
              f.path,
              'Static locator/wait/force pattern needs manual justification; dynamic behavior is not inferred.',
            ],
            'Inspect the relevant scope and real locator evidence; never auto-rewrite.',
            f.path,
            'HEURISTIC',
          ),
        );
    }
    if (/playwright\.config\.ts$|karate-config\.js$/.test(f.path)) {
      const parsed = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true);
      if (
        (parsed as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics
          ?.length
      )
        findings.push(
          finding(
            'INVALID_RUNNER_CONFIG',
            root,
            'ERROR',
            [f.path, 'Static JavaScript/TypeScript parse failure; config was not executed.'],
            'Fix configuration syntax and revalidate trusted native execution.',
            f.path,
          ),
        );
    }
  }
  if (index) {
    const definitions = new Map<string, string[]>();
    for (const f of index.files)
      for (const c of f.capabilities.filter((c) => c.kind === 'step'))
        definitions.set(c.name, [...(definitions.get(c.name) || []), f.path + ':' + c.line]);
    for (const [name, locations] of definitions) {
      if (locations.length > 1)
        findings.push(
          finding(
            'DUPLICATE_STEP_CANDIDATE',
            root,
            'WARNING',
            [name, ...locations],
            'Inspect framework scope before consolidating definitions.',
            name,
            'HEURISTIC',
          ),
        );
      if (!steps.has(name) && !/[\\^$]/.test(name))
        findings.push(
          finding(
            'ORPHAN_STEP_CANDIDATE',
            root,
            'INFO',
            [
              name,
              ...locations,
              'Only literal Cucumber string/int matching supported; external features/dynamic expressions may use it.',
            ],
            'Check all supported feature/step scopes before removal.',
            name,
            'HEURISTIC',
          ),
        );
    }
    for (const file of index.files.filter((f) =>
      f.capabilities.some((c) => ['page', 'component'].includes(c.kind)),
    )) {
      const basename = file.path
        .split('/')
        .pop()!
        .replace(/\.[jt]sx?$/, '');
      if (
        !index.files.some((f) =>
          f.capabilities.some(
            (c) =>
              c.kind === 'import' &&
              c.name
                .split('/')
                .pop()
                ?.replace(/\.[jt]sx?$/, '') === basename,
          ),
        )
      )
        findings.push(
          finding(
            'UNUSED_PAGE_CANDIDATE',
            root,
            'INFO',
            [
              file.path,
              'No static indexed named import; dynamic references and excluded files are unknown.',
            ],
            'Inspect all consumers before removing a Page/component.',
            file.path,
            'HEURISTIC',
          ),
        );
    }
    const methods = new Map<string, string[]>();
    for (const file of index.files)
      for (const c of file.capabilities.filter((c) => c.kind === 'method')) {
        const name = c.name.split('.').at(-1)!;
        if (name !== 'constructor') methods.set(name, [...(methods.get(name) || []), file.path]);
      }
    for (const [name, locations] of methods)
      if (new Set(locations).size > 1)
        findings.push(
          finding(
            'REPEATED_CAPABILITY_CANDIDATE',
            root,
            'INFO',
            [name, ...new Set(locations)],
            'Review whether these similarly named methods represent reusable behavior or distinct domain intent.',
            name,
            'HEURISTIC',
          ),
        );
  }
  const groups = new Map<string, { runs: Set<string>; outcomes: Set<string> }>();
  for (const run of runs.slice(-100)) {
    for (const test of run.tests) {
      if (!test.scenarioId || !['PASSED', 'FAILED'].includes(test.status)) continue;
      const key = JSON.stringify([
        run.framework,
        test.scenarioId,
        test.name,
        run.baseUrl,
        run.executableHash,
        run.snapshot.map((s) => s.hash),
      ]);
      const g = groups.get(key) || { runs: new Set<string>(), outcomes: new Set<string>() };
      g.runs.add(run.id);
      g.outcomes.add(test.status);
      groups.set(key, g);
      for (const step of test.steps.filter(
        (s) =>
          /given|setup|before hooks|precondition|auth|login/i.test(s.name) &&
          s.durationMs > slowSetupMs,
      ))
        findings.push(
          finding(
            'SLOW_SETUP_CANDIDATE',
            root,
            'WARNING',
            [
              `run:${run.id}`,
              step.name,
              `${step.durationMs} ms exceeds configured ${slowSetupMs} ms; attribution is heuristic.`,
            ],
            'Compare repeated runs and equivalent safe API setup; preserve independence.',
            hash(step.name),
            'HEURISTIC',
          ),
        );
      if (
        test.status === 'FAILED' &&
        /locator|getByRole|getByLabel|getByTestId|toHaveCount/i.test(test.error || '')
      )
        findings.push(
          finding(
            'LOCATOR_FAILURE',
            root,
            'ERROR',
            [`run:${run.id}`, test.name, test.error || ''],
            'Use reviewed maintenance to distinguish product omission from selector defects.',
            test.scenarioId,
          ),
        );
    }
  }
  for (const [key, g] of groups)
    if (g.runs.size > 1 && g.outcomes.size > 1)
      findings.push(
        finding(
          'FLAKY_SCENARIO_CANDIDATE',
          root,
          'WARNING',
          [...g.runs]
            .map((r) => 'run:' + r)
            .concat(
              'Mixed outcomes for same recorded executable/contract/environment/example; mutable data or environment can still differ.',
            ),
          'Investigate actual failures/data/environment without hiding them with retries.',
          hash(key),
          'HEURISTIC',
        ),
      );
  return findings;
}
export function inspectInstructions(
  root: string,
  path: string,
  text: string,
  registeredRefs?: string[],
) {
  const result: Finding[] = [];
  if (Buffer.byteLength(text) > 8000)
    result.push(
      finding(
        'OVERSIZED_INSTRUCTIONS',
        root,
        'WARNING',
        [path, `${Buffer.byteLength(text)} UTF-8 bytes exceeds the 8 KB heuristic threshold.`],
        'Move task-specific detail into relevant references; keep universal instructions concise.',
        path,
        'HEURISTIC',
      ),
    );
  if (
    /require.{0,40}approval/i.test(text) &&
    /never.{0,20}(ask|require).{0,20}approval|without.{0,15}approval/i.test(text)
  )
    result.push(
      finding(
        'CONTRADICTORY_INSTRUCTIONS_CANDIDATE',
        root,
        'WARNING',
        [path, 'Conflicting approval phrases found; context/quotations may explain them.'],
        'Review the actual instruction scopes and sources before proposing changes.',
        path,
        'HEURISTIC',
      ),
    );
  if (registeredRefs)
    for (const ref of new Set(text.match(/\b(?:source|target):[A-Za-z0-9_-]{1,80}\b/g) || []))
      if (!registeredRefs.includes(ref))
        result.push(
          finding(
            'OBSOLETE_REPOSITORY_REFERENCE_CANDIDATE',
            root,
            'WARNING',
            [
              path,
              ref,
              'Referenced registration is absent; examples or historical references can be legitimate.',
            ],
            'Review the reference against current workspace registrations before proposing an instruction update.',
            path + ':' + ref,
            'HEURISTIC',
          ),
        );
  return result;
}
