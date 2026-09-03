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
    transcriptionStatus: string | null;
  } | null,
  transcriptRevisionId: string | null,
): boolean {
  if (transcriptRevisionId === null) {
    return true;
  }
  return (
    state?.transcriptionStatus === "ready" &&
    state.activeTranscriptRevisionId === transcriptRevisionId
  );
}
