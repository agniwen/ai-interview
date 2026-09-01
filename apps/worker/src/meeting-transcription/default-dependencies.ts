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
    requestIntelligence: requestAutomaticMeetingIntelligence,
    saveChunkCheckpoint: saveMeetingTranscriptionChunkCheckpoint,
  });
