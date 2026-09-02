import type { HumanInterviewEvaluationStatus } from "@arc/db-schema/studio-interviews";

interface HumanInterviewEvaluationDraftSource {
  meetingSessionId: string | null;
  transcriptionState: "failed" | "pending" | "processing" | "ready";
  transcript: { id: string } | null;
}

export function canSaveHumanInterviewEvaluationDraft(
  input: HumanInterviewEvaluationDraftSource,
): input is HumanInterviewEvaluationDraftSource & {
  meetingSessionId: string;
  transcriptionState: "ready";
  transcript: { id: string };
} {
  return (
    input.transcriptionState === "ready" &&
    Boolean(input.meetingSessionId) &&
    Boolean(input.transcript)
  );
}

export function isHumanInterviewEvaluationPublishCurrent(
  state: {
    activeTranscriptRevisionId: string | null;
    evaluationStatus: HumanInterviewEvaluationStatus;
    evaluationTranscriptRevisionId: string | null;
  },
  transcriptRevisionId: string,
): boolean {
  return (
    state.evaluationStatus === "generating" &&
    state.evaluationTranscriptRevisionId === transcriptRevisionId &&
    state.activeTranscriptRevisionId === transcriptRevisionId
  );
}

export function isHumanInterviewEvaluationSubmissionCurrent(
  state: {
    activeTranscriptRevisionId: string | null;
    transcriptionStatus: string;
  },
  transcriptRevisionId: string,
): boolean {
  return (
    state.transcriptionStatus === "ready" &&
    state.activeTranscriptRevisionId === transcriptRevisionId
  );
}
