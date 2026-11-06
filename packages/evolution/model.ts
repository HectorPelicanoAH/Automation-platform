import type { RootRef } from '../intelligence/index.ts';
export type KnowledgeClass =
  'TEMPORARY' | 'REPOSITORY' | 'PROCEDURE' | 'DECISION' | 'SKILL_IMPROVEMENT';
export interface EvidenceRef {
  ref: RootRef;
  path: string;
  hash: string;
  type: 'file' | 'executable';
  revision?: string | null;
}
export interface KnowledgeVersion {
  hash: string;
  claim: string;
  classification: KnowledgeClass;
  confidence: 'SYNTAX' | 'NATIVE' | 'HUMAN';
  provenance: 'OBSERVED' | 'INFERRED';
  sources: EvidenceRef[];
  workflows: string[];
  lastSeenAt?: string;
  createdAt: string;
}
export interface Knowledge {
  id: string;
  key: string;
  targetId: string;
  currentHash: string;
  status: 'CANDIDATE' | 'ACTIVE' | 'REJECTED' | 'STALE';
  versions: KnowledgeVersion[];
  documentHash?: string;
  reviews: { hash: string; at: string; approve: boolean; reviewer: 'local-user' }[];
}
export interface KnowledgeDocument {
  id: string;
  recordId: string;
  versionHash: string;
  hash: string;
  text: string;
  createdAt: string;
}
export interface SkillBundle {
  id: string;
  name: string;
  version: string;
  hash: string;
  parentId?: string;
  files: { path: string; content: string }[];
  problem: string;
  benefit: string;
  evidence: string[];
  createdAt: string;
  status: 'PROPOSED' | 'REJECTED';
  evaluator: 'health-summary-v1' | null;
}
export interface SkillEvaluation {
  id: string;
  bundleId: string;
  bundleHash: string;
  baselineId?: string;
  baselineHash?: string;
  caseSetHash: string;
  evaluatorHash: string;
  status: 'PASSED' | 'FAILED';
  mode: 'DETERMINISTIC_SCRIPT';
  cases: {
    id: string;
    candidate: { valid: boolean; bytes: number };
    baseline: { valid: boolean; bytes: number } | null;
  }[];
  comparison: {
    candidateBytes: number;
    baselineBytes: number | null;
    correctness: string;
    limits: string;
  };
  createdAt: string;
}
export interface SkillChange {
  id: string;
  targetId: string;
  name: string;
  operation: 'ACTIVATE' | 'ROLLBACK';
  bundleId: string;
  bundleHash: string;
  priorBundleId: string | null;
  priorHash: string | null;
  evaluationId: string;
  targetRevision: string;
  diff: string;
  hash: string;
  status: 'PROPOSED' | 'APPLIED' | 'FAILED' | 'REJECTED';
  createdAt: string;
  appliedAt?: string;
  approval?: { hash: string; reviewer: 'local-user'; at: string };
  error?: string;
}
export interface ActiveSkill {
  id: string;
  targetId: string;
  name: string;
  bundleId: string;
  hash: string;
  history: { bundleId: string; hash: string; changeId: string; at: string }[];
}
