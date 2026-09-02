import { createHumanInterviewRecordingDao } from "@app/meeting-processing/human-interview";
import { db } from "@server/lib/server/db/index";

export const {
  ingestHumanInterviewRecording,
  listRecoverableHumanInterviewRecordingJobs,
  markHumanInterviewTranscriptionUnavailable,
  saveHumanInterviewRecordingProcessingError,
} = createHumanInterviewRecordingDao(db);
