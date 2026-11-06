export type RecordingStatus =
  'STARTING' | 'RECORDING' | 'STOPPING' | 'COMPLETED' | 'CANCELLED' | 'INTERRUPTED' | 'FAILED';
export interface CapturePolicy {
  url: string;
  allowedOrigins: string[];
  screenshots: boolean;
  maskSelectors: string[];
  sensitiveQueryKeys: string[];
  retentionDays: number;
  audioRetentionDays: number;
  audioConsent: boolean;
}
export interface LocatorEvidence {
  kind: 'role' | 'label' | 'testId' | 'id';
  value: string;
  name?: string;
  count: number;
  matchesTarget: boolean;
}
export interface EvidenceEvent {
  sequence: number;
  timeMs: number;
  receivedMs: number;
  sourceMs?: number;
  offsetMs?: number;
  uncertaintyMs?: number;
  producer?: string;
  sourceEventId?: string;
  pageId?: string;
  frameId?: string;
  kind: 'action' | 'context' | 'navigation' | 'network' | 'clock' | 'gap' | 'page' | 'marker';
  provenance: 'OBSERVED';
  detail: string;
  url?: string;
  dom?: string;
  aria?: string;
  locators?: LocatorEvidence[];
  screenshot?: string;
  evidenceAtMs?: number;
}
export interface CaptureArtifact {
  name: string;
  mime: string;
  bytes: number;
  hash: string;
  timeMs: number;
  kind: 'screenshot' | 'audio';
  expired?: boolean;
}
export interface AudioChunk {
  sequence: number;
  startMs: number;
  endMs: number;
  sourceEndMs: number;
  offsetMs: number;
  uncertaintyMs: number;
  artifact: string;
}
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  provenance: 'NARRATED';
  source: 'manual';
}
export interface TranscriptRevision {
  revision: number;
  createdAt: string;
  segments: TranscriptSegment[];
}
export interface Recording {
  id: string;
  name: string;
  status: RecordingStatus;
  createdAt: string;
  finishedAt?: string;
  durationMs: number;
  policy: CapturePolicy;
  events: number;
  gaps: number;
  bytes: number;
  artifacts: CaptureArtifact[];
  audio: AudioChunk[];
  microphone: 'OFF' | 'RECORDING' | 'STOPPED' | 'DENIED' | 'ERROR';
  transcript: TranscriptRevision[];
  workerPid?: number;
  workerExit?: { code: number | null; signal: string | null };
  error?: string;
  incomplete: boolean;
}
export const RECORDING_LIMITS = {
  durationMs: 30 * 60_000,
  events: 10_000,
  bytes: 128 * 1024 * 1024,
  audioBytes: 32 * 1024 * 1024,
  chunkBytes: 512 * 1024,
  artifactBytes: 2 * 1024 * 1024,
  eventBytes: 24_000,
  pages: 8,
  frames: 64,
};
export const recordingActive = (status: RecordingStatus) =>
  ['STARTING', 'RECORDING', 'STOPPING'].includes(status);
export const monotonicMs = () => Number(process.hrtime.bigint()) / 1e6;
