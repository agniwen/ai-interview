import { createHumanInterviewRecordingDao } from "@app/meeting-processing/human-interview";
import { db } from "../../../../../../lib/server/db/index";

export const {
  ingestHumanInterviewRecording,
  listRecoverableHumanInterviewRecordingJobs,
  markHumanInterviewTranscriptionUnavailable,
  saveHumanInterviewRecordingProcessingError,
} = createHumanInterviewRecordingDao(db);
