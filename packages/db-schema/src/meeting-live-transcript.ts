export interface MeetingLiveTranscriptDraftRecord {
  capturedAt: string;
  droppedAudioMs: number;
  droppedPcmFrames: number;
  error: string | null;
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
    startMs?: number;
    text: string;
    track: "microphone" | "system";
  }[];
}
