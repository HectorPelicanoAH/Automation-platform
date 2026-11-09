export interface Finding {
  fingerprint: string;
  code: string;
  root: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  confidence: 'DETERMINISTIC' | 'HEURISTIC';
  evidence: string[];
  action: string;
}
export interface HealthCheck {
  name: string;
  status: 'PASSED' | 'FINDINGS' | 'UNAVAILABLE';
  detail: string;
}
export interface HealthRun {
  id: string;
  targetId?: string;
  origin: 'MANUAL' | 'SCHEDULED';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'INTERRUPTED';
  createdAt: string;
  finishedAt?: string;
  checks: HealthCheck[];
  findings: Finding[];
  error?: string;
}
export interface HealthSchedule {
  id: string;
  targetId?: string;
  enabled: boolean;
  intervalMinutes: number;
  slowSetupMs: number;
  lastError?: string;
  nextAt: string | null;
  lastRunId: string | null;
  missed: number;
  skippedOverlap: number;
}
