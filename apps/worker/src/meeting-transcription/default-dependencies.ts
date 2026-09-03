import { downloadMeetingRecordingObjectToFile } from "@app/object-storage";
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
    requestHumanEvaluation: requestAutomaticHumanInterviewEvaluation,
    requestIntelligence: requestAutomaticMeetingIntelligence,
    saveChunkCheckpoint: transcriptionDao.saveMeetingTranscriptionChunkCheckpoint,
  });
