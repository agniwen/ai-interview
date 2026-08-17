import { downloadMeetingRecordingObjectToFile } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  loadMeetingTranscriptionSource,
  markMeetingTranscriptionChunkFailed,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  saveMeetingTranscriptionChunkCheckpoint,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/dao";
import { requestAutomaticMeetingIntelligence } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/service";
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
