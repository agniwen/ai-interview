import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";
import type { MeetingSourceTrack } from "@arc/shared/meeting-recording";

export interface FinalTranscriptionAudioChunk {
  contentType: string;
  endMs: number;
  filePath: string;
  index: number;
  startMs: number;
  track: MeetingSourceTrack;
}

export interface FinalTranscriptionInput {
  chunks: FinalTranscriptionAudioChunk[];
  languageHint: string | null;
  model: string;
  region: string;
}

export interface MeetingProviderArtifactInput {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
  providerArtifact: unknown;
  signal: AbortSignal;
  stage: string;
}

export interface MeetingTranscriptionProvider {
  /** Implementations must honor `signal` and treat an already-missing artifact as deleted. */
  deleteRemoteArtifact?: (input: MeetingProviderArtifactInput) => Promise<void>;
  transcribeFinal(input: FinalTranscriptionInput): Promise<CanonicalMeetingTranscript>;
}
