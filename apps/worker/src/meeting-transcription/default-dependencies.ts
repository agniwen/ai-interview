import { downloadMeetingRecordingObjectToFile } from "@app/object-storage";
import { loadHumanInterviewRecognitionDocuments } from "@app/meeting-processing/human-interview";
import { generateMeetingRecognitionHints } from "@app/meeting-processing/transcription";
import { db } from "../db";
import {
  meetingTranscriptionDao as transcriptionDao,
  requestAutomaticHumanInterviewEvaluation,
  requestAutomaticMeetingIntelligence,
} from "../meeting-processing-daos";
import { createDefaultMeetingTranscriptionDependencies } from "./processor";

export const defaultMeetingTranscriptionDependencies =
  createDefaultMeetingTranscriptionDependencies({
    claim: transcriptionDao.claimMeetingTranscriptionRun,
    claimChunk: transcriptionDao.claimMeetingTranscriptionChunk,
    downloadSource: downloadMeetingRecordingObjectToFile,
    loadSource: transcriptionDao.loadMeetingTranscriptionSource,
    markChunkFailed: transcriptionDao.markMeetingTranscriptionChunkFailed,
    markFailed: transcriptionDao.markMeetingTranscriptionFailed,
    publish: transcriptionDao.publishMeetingTranscript,
    recognitionHintsForJob: async (job) =>
      generateMeetingRecognitionHints(await loadHumanInterviewRecognitionDocuments(db, job)),
    requestHumanEvaluation: requestAutomaticHumanInterviewEvaluation,
    requestIntelligence: requestAutomaticMeetingIntelligence,
    saveChunkCheckpoint: transcriptionDao.saveMeetingTranscriptionChunkCheckpoint,
  });
