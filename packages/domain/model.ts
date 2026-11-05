export type Framework = 'playwright' | 'karate';
export type SourceKind = 'frontend' | 'backend' | 'shared' | 'other';
export interface Source {
  id: string;
  name: string;
  path: string;
  kind: SourceKind;
  preferredRef: string;
  enabled: boolean;
  indexEnabled: boolean;
  include: string[];
  exclude: string[];
  detected: string[];
  git: { branch: string; commit: string } | null;
}
export interface Target {
  id: string;
  name: string;
  path: string;
  trustFingerprint?: string;
}
export interface Scenario {
  id: string;
  name: string;
  line: number;
  tags: string[];
  examples: { row: number; values: Record<string, string> }[];
}
export interface Feature {
  path: string;
  name: string;
  hash: string;
  text: string;
  scenarios: Scenario[];
}
export interface Selection {
  kind: 'suite' | 'feature' | 'scenario' | 'tags';
  value?: string;
}
export interface StepResult {
  name: string;
  status: string;
  durationMs: number;
  error?: string;
}
export interface TestResult {
  nativeId: string;
  name: string;
  status: string;
  durationMs: number;
  scenarioId: string | null;
  featurePath: string | null;
  row: number | null;
  steps: StepResult[];
  error?: string;
}
export interface Run {
  id: string;
  targetId: string;
  framework: Framework;
  selection: Selection;
  status:
    'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'PASSED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  baseUrl: string;
  idempotencyKey: string;
  snapshot: { path: string; hash: string; scenarios: Scenario[] }[];
  tests: TestResult[];
  error?: string;
  exitCode?: number | null;
  artifacts: { name: string; size: number; hash: string }[];
  processGroups?: number[];
  artifactsExpired?: boolean;
  executableHash?: string;
  toolchain?: { node: string; framework: string };
}
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
