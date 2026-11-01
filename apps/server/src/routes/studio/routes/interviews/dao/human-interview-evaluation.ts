import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import { db } from "../../../../../infrastructure/db/index";
import { loadMeetingTranscriptRevision } from "../../../../meetings/transcription/revision-dao";
import { enqueueHumanInterviewRoundCompletion } from "./human-interview-round-completion";

export const {
  claimHumanInterviewEvaluationAfterTranscriptCorrection,
  listHumanInterviewEvaluationSnapshotsForAnalysis,

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
