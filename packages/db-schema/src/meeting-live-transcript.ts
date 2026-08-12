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
    final: boolean;
    id: string;
    sectionId: string;
    text: string;
    track: "microphone" | "system";
  }[];
}
