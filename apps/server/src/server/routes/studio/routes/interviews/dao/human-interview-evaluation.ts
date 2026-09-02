import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import { db } from "../../../../../../lib/server/db/index";
import { loadMeetingTranscriptRevision } from "../../../../meetings/transcription/revision-dao";
import { enqueueHumanInterviewRoundCompletion } from "./human-interview-round-completion";

export const {
  claimHumanInterviewEvaluationAfterTranscriptCorrection,
  listHumanInterviewEvaluationSnapshotsForAnalysis,
  listRecoverableHumanInterviewEvaluationJobs,
  loadHumanInterviewEvaluationInput,
  loadHumanInterviewReview,
  markHumanInterviewEvaluationFailed,
  publishHumanInterviewEvaluation,
  recoverHumanInterviewReviewFromLiveTranscript,
  requestHumanInterviewEvaluation,
  saveHumanInterviewEvaluationDraft,
  submitHumanInterviewEvaluation,
} = createHumanInterviewEvaluationDao(db, {
  enqueueHumanInterviewRoundCompletion,
  loadMeetingTranscriptForEvaluation: loadMeetingTranscriptRevision,
  loadMeetingTranscriptRevision,
});

export type HumanInterviewLiveTranscriptRecoveryResult = Awaited<
  ReturnType<typeof recoverHumanInterviewReviewFromLiveTranscript>
>;
