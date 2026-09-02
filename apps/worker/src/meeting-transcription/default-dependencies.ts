import { downloadMeetingRecordingObjectToFile } from "@app/object-storage";
import {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  loadMeetingTranscriptionSource,
  markMeetingTranscriptionChunkFailed,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  saveMeetingTranscriptionChunkCheckpoint,
} from "@app/server/worker/meeting-transcription";
import { requestAutomaticMeetingIntelligence } from "@app/server/worker/meeting-intelligence";
import { requestAutomaticHumanInterviewEvaluation } from "@app/server/worker/human-interview";
import { createDefaultMeetingTranscriptionDependencies } from "./processor";

export const defaultMeetingTranscriptionDependencies =
  createDefaultMeetingTranscriptionDependencies({
    claim: claimMeetingTranscriptionRun,
    claimChunk: claimMeetingTranscriptionChunk,
    downloadSource: downloadMeetingRecordingObjectToFile,
    loadSource: loadMeetingTranscriptionSource,
    markChunkFailed: markMeetingTranscriptionChunkFailed,
    markFailed: markMeetingTranscriptionFailed,
    publish: publishMeetingTranscript,
    requestHumanEvaluation: requestAutomaticHumanInterviewEvaluation,
    requestIntelligence: requestAutomaticMeetingIntelligence,
    saveChunkCheckpoint: saveMeetingTranscriptionChunkCheckpoint,
  });
