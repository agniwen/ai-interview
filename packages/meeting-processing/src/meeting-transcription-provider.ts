import type { FinalTranscriptionAudioChunk } from "@app/meeting-media";
import type { CanonicalMeetingTranscript } from "@app/shared/meeting-transcription";

export { MeetingProviderResponseError } from "./meeting-transcription-provider-response-error";

export class MeetingProviderQuotaError extends Error {
  readonly code = "provider-quota" as const;

  constructor() {
    super("Meeting transcription provider quota is exhausted");
    this.name = "MeetingProviderQuotaError";
  }
}

export type { FinalTranscriptionAudioChunk } from "@app/meeting-media";

export interface FinalTranscriptionInput {
  chunks: FinalTranscriptionAudioChunk[];
  languageHint: string | null;
  model: string;
  region: string;
  signal?: AbortSignal;
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
