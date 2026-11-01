import { createMeetingTranscriptionDao } from "@app/meeting-processing/transcription";
import { db } from "../../../infrastructure/db/index";
import { rebuildMeetingSearchProjection } from "../routes/search/dao";
import { isWorkspaceAdministrator } from "../access";

export const {
  DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON,
  DEFAULT_MEETING_TRANSCRIPTION_PROVIDER,
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,

  getMeetingTranscriptionJobForMeeting,

  listRecoverableMeetingTranscriptionJobs,
  loadMeetingTranscriptionChunkCheckpoint,
  loadMeetingTranscriptionPolicy,

  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  resetMeetingTranscriptionForRetry,
  restoreMeetingTranscriptionAfterRetryFailure,
  saveMeetingTranscriptionChunkCheckpoint,
  updateMeetingTranscriptionPolicy,
} = createMeetingTranscriptionDao(db, {
  isWorkspaceAdministrator,
  rebuildMeetingSearchProjection,
});
