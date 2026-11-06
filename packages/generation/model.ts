import type { Framework } from '../domain/model.ts';
import type { RootRef } from '../intelligence/index.ts';
import type { AgentEvent } from './provider.ts';
export interface AiSettings {
  enabled: boolean;
  binary: string;
  binaryHash: string;
  analysisModel: string;
  implementationModel: string;
  analysisEffort: string;
  implementationEffort: string;
}
export interface ContextFile {
  ref: RootRef;
  path: string;
  hash: string;
  bytes: number;
}
export interface GenerationTask {
  id: string;
  kind: 'analysis' | 'implementation';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'INTERRUPTED';
  targetId: string;
  recordingId: string;
  contractId?: string;
  changeId?: string;
  createdAt: string;
  finishedAt?: string;
  events: (AgentEvent & { at: string })[];
  contextFiles: ContextFile[];
  retrievalBytes: number;
  promptBytes: number;
  toolCalls: number;
  model: string;
  usage: unknown | null;
  error?: string;
}
export interface Claim {
  text: string;
  provenance: 'OBSERVED' | 'NARRATED' | 'INFERRED';
  evidenceIds: string[];
}
export interface ContractProposal {
  id: string;
  taskId: string;
  targetId: string;
  recordingId: string;
  featurePath: string;
  evidenceHash: string;
  targetRevision: string;
  gherkin: string;
  hash: string;
  claims: Claim[];
  sourceIds: string[];
  questions: { id: string; text: string }[];
  answers: { id: string; text: string }[];
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  approval?: { hash: string; at: string; reviewer: 'local-user' };
}
export interface FileChange {
  path: string;
  before: string | null;
  baseHash: string | null;
  after: string;
}
export interface ChangeProposal {
  framework?: Framework;
  apiEndpoint?: { ref: RootRef; path: string; symbol: string; hash: string };
  id: string;
  taskId: string;
  contractId: string;
  contractHash: string;
  targetId: string;
  targetRevision: string;
  evidenceHash: string;
  plan: { summary: string; reuse: { path: string; symbol: string }[]; files: string[] };
  files: FileChange[];
  diff: string;
  hash: string;
  status:
    'STAGED' | 'VALIDATING' | 'VALIDATED' | 'INVALIDATED' | 'REJECTED' | 'APPLIED' | 'APPLY_FAILED';
  createdAt: string;
  validationRunId?: string;
  validationFingerprint?: string;
  appliedAt?: string;
  error?: string;
  approval?: { hash: string; at: string; reviewer: 'local-user' };
}
