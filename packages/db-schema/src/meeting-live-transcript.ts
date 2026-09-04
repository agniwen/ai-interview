export interface MeetingLiveTranscriptDraftRecord {
  capturedAt: string;
  droppedAudioMs: number;
  droppedPcmFrames: number;
  error: string | null;
  language?: string;
  model?: string;
  provider?: "deepgram" | "qwen";
  sections: {
    id: string;
    sequence: number;
    startedAt: string;
    track: "microphone" | "system";
  }[];
  turns: {
    correctionModel?: string;
    endMs?: number;
    final: boolean;
    id: string;
    originalText?: string;
    sectionId: string;
    speakerDisplayName?: string | null;
    speakerKey?: string;
    startMs?: number;
    text: string;
    track: "microphone" | "system";
    words?: {
      endMs: number;
      punctuation: string;
      startMs: number;
      text: string;
    }[];
  }[];
}
