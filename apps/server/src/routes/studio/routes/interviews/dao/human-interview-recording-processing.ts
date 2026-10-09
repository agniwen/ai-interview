import { createHumanInterviewRecordingDao } from "@app/meeting-processing/human-interview";
import { db } from "../../../../../infrastructure/db/index";

export const {
  ingestHumanInterviewRecording,
  listRecoverableHumanInterviewRecordingJobs,
  markHumanInterviewTranscriptionUnavailable,
  saveHumanInterviewRecordingProcessingError,
} = createHumanInterviewRecordingDao(db);
