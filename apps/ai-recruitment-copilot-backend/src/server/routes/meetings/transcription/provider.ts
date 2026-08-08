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

export interface MeetingTranscriptionProvider {
  transcribeFinal(input: FinalTranscriptionInput): Promise<CanonicalMeetingTranscript>;
}
