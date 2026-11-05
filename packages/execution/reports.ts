import { readdirSync, readFileSync, statSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Run, TestResult, StepResult } from '../domain/model.ts';

export function redact(text: string) {
  return text
    .replace(
      /(authorization|cookie|set-cookie|api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|token)(["']?\s*[=:]\s*)[^\r\n,}&]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]');
}
const status = (value: string) =>
  ({
    passed: 'PASSED',
    failed: 'FAILED',
    timedOut: 'TIMED_OUT',
    skipped: 'SKIPPED',
    interrupted: 'CANCELLED',
  })[value] || 'UNKNOWN';
interface PWStep {
  title: string;
  duration?: number;
  error?: { message?: string };
  steps?: PWStep[];
}
interface PWSuite {
  title: string;
  suites?: PWSuite[];
  specs?: {
    title: string;
    file: string;
    line: number;
    tags?: string[];
    tests: {
      results: {
        status: string;
        duration: number;
        retry?: number;
        error?: { message?: string };
        steps?: PWStep[];
      }[];
    }[];
  }[];
}
interface CucumberFeature {
  uri: string;
  elements?: {
    id: string;
    name: string;
    tags?: { name: string }[];
    steps?: {
      name: string;
      result?: { status?: string; duration?: number; error_message?: string };
    }[];
  }[];
}

export function playwrightResults(document: unknown, run: Pick<Run, 'snapshot'>): TestResult[] {
  if (
    !document ||
    typeof document !== 'object' ||
    !Array.isArray((document as { suites?: unknown }).suites)
  )
    throw new Error('Malformed Playwright report');
  const tests: TestResult[] = [];
  const steps = (raw: PWStep[]): StepResult[] =>
    raw.flatMap((s) => [
      {
        name: s.title,
        status: s.error ? 'FAILED' : 'PASSED',
        durationMs: s.duration || 0,
        error: s.error?.message,
      },
      ...steps(s.steps || []),
    ]);
  const visit = (suite: PWSuite, parents: string[]) => {
    const names = [...parents, suite.title];
    for (const spec of suite.specs || []) {
      const name = [...names, spec.title].filter(Boolean).join(' › ');
      const feature = run.snapshot.find(
        (f) =>
          basename(spec.file).includes(basename(f.path)) ||
          names.some((n) => n.includes(basename(f.path))),
      );
      const scenario = feature?.scenarios.find(
        (s) => name.includes(s.name) || spec.tags?.includes('@scenario:' + s.id),
      );
      for (const [index, test] of spec.tests.entries())
        for (const [attempt, result] of test.results.entries())
          tests.push({
            nativeId: `${spec.file}:${spec.line}:${index}:${attempt}`,
            name,
            status: status(result.status),
            durationMs: result.duration,
            scenarioId: scenario?.id.startsWith('unmapped:') ? null : scenario?.id || null,
            featurePath: feature?.path || null,
            row: scenario?.examples.find((row) => row.row === spec.line)?.row || null,
            steps: steps(result.steps || []),
            error: result.error?.message ? redact(result.error.message) : undefined,
          });
    }
    for (const child of suite.suites || []) visit(child, names);
  };
  for (const suite of (document as { suites: PWSuite[] }).suites) visit(suite, []);
  return tests;
}

export function karateResults(document: unknown, run: Pick<Run, 'snapshot'>): TestResult[] {
  if (!Array.isArray(document)) throw new Error('Malformed Karate report');
  const tests: TestResult[] = [];
  for (const feature of document as CucumberFeature[]) {
    if (typeof feature.uri !== 'string' || !Array.isArray(feature.elements))
      throw new Error('Malformed Karate feature');
    for (const [index, scenario] of feature.elements.entries()) {
      const id =
        scenario.tags?.find((t) => t.name.startsWith('@scenario:'))?.name.slice(10) || null;
      const canonical = run.snapshot.find((f) => f.scenarios.some((s) => s.id === id));
      const steps: StepResult[] = (scenario.steps || []).map((s) => ({
        name: s.name,
        status: status(s.result?.status || ''),
        durationMs: (s.result?.duration || 0) / 1_000_000,
        error: s.result?.error_message ? redact(s.result.error_message) : undefined,
      }));
      tests.push({
        nativeId: `${feature.uri}:${scenario.id}:${index}`,
        name: scenario.name,
        scenarioId: canonical ? id : null,
        featurePath: canonical?.path || null,
        row: null,
        status: steps.some((s) => s.status === 'FAILED')
          ? 'FAILED'
          : steps.length && steps.every((s) => s.status === 'PASSED')
            ? 'PASSED'
            : 'UNKNOWN',
        durationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
        steps,
        error: steps.find((s) => s.error)?.error,
      });
    }
  }
  return tests;
}

export function reportFiles(directory: string, prefix = ''): string[] {
  if (!statSync(directory).isDirectory()) return [];
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    if (lstatSync(full).isSymbolicLink()) return [];
    const key = prefix ? prefix + '/' + name : name;
    return statSync(full).isDirectory() ? reportFiles(full, key) : [key];
  });
}
export const readJson = (path: string): unknown => {
  if (statSync(path).size > 10_000_000)
    throw new Error('Native JSON exceeds the 10 MB normalization limit');
  return JSON.parse(readFileSync(path, 'utf8'));
};
