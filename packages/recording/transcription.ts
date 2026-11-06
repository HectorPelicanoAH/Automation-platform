import type { AudioChunk } from './model.ts';

/** Provider boundary for an explicitly configured engine. No engine is activated implicitly. */
export interface TranscriptionProvider {
  readonly id: string;
  readonly version: string;
  readonly timestampPrecision: 'word' | 'segment' | 'none';
  transcribe(
    input: { recordingId: string; audio: AudioChunk[]; language?: string },
    signal: AbortSignal,
  ): Promise<{
    segments: { startMs?: number; endMs?: number; text: string; confidence?: number }[];
  }>;
}
export const transcriptionCapabilities = {
  mode: 'manual',
  automaticAvailable: false,
  reason:
    'No automatic transcription engine is installed or configured; manual timestamped narration is available.',
} as const;
