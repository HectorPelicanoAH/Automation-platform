import type { ChangeProposal } from '../generation/model.ts';
export type Classification =
  'LOCATOR_DEFECT' | 'PRODUCT_REGRESSION' | 'ENVIRONMENT' | 'DATA' | 'UNKNOWN';
export interface Diagnosis {
  id: string;
  runId: string;
  targetId: string;
  createdAt: string;
  targetRevision: string;
  executableCurrent: boolean;
  evidenceHash: string;
  evidence: { source: string; text: string }[];
  hypotheses: { classification: Classification; reason: string; confidence: 'symptom' }[];
  conclusion: Classification;
  rationale?: string;
  review?: { at: string; reviewer: 'local-user'; observedEvidence: string };
  files: { path: string; hash: string; text: string }[];
  sourceSnapshots: {
    ref: import('../intelligence/index.ts').RootRef;
    path: string;
    hash: string;
    revision: string | null;
  }[];
  graphIdentity: string;
  relatedEdges: unknown[];
  recentChanges: {
    available: boolean;
    revision: string | null;
    commits: string[];
    changedPaths: string[];
  };
  limitations: string[];
}
export interface Repair extends Omit<ChangeProposal, 'taskId' | 'contractId'> {
  diagnosisId: string;
  featurePath: string;
  originalRunId: string;
  rollback?: { hash: string; diff: string; status: 'PROPOSED' | 'APPLIED'; at?: string };
}
