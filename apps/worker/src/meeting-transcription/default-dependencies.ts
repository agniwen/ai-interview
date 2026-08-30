import { downloadMeetingRecordingObjectToFile } from "@app/server/lib/server/s3";
import {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  loadMeetingTranscriptionSource,
  markMeetingTranscriptionChunkFailed,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  saveMeetingTranscriptionChunkCheckpoint,
} from "@app/server/server/routes/meetings/transcription/dao";
import { requestAutomaticMeetingIntelligence } from "@app/server/server/routes/meetings/intelligence/service";
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
