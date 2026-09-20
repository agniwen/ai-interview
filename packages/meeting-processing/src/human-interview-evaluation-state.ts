import type { HumanInterviewEvaluationStatus } from "@app/db-schema/studio-interviews";

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
    reviewTranscriptRevisionId?: string | null;
    transcriptionStatus: string | null;
  } | null,
  transcriptRevisionId: string | null,
): boolean {
  if (transcriptRevisionId === null) {
    return true;
  }
  // Manual feedback may use incomplete material; protect the revision displayed
  // by loadHumanInterviewReview without requiring successful AI transcription.
  const currentRevisionId = state?.activeTranscriptRevisionId ?? state?.reviewTranscriptRevisionId;
  return currentRevisionId === transcriptRevisionId;
}
