import { randomUUID } from "node:crypto";
import {
  claimMeetingIntelligenceRun,
  heartbeatMeetingIntelligenceRun,
  loadMeetingIntelligenceTranscript,
  markMeetingIntelligenceFailed,
  publishMeetingIntelligence,
  saveMeetingIntelligenceCheckpoint,
  saveMeetingIntelligenceProgress,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/dao";
import {
  generateMeetingIntelligence,
  getMeetingIntelligenceGeneratorSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/generator";
import type { MeetingIntelligenceDependencies } from "./processor";

export const defaultMeetingIntelligenceDependencies: MeetingIntelligenceDependencies = {
  claim: claimMeetingIntelligenceRun,
  createExecutionToken: randomUUID,
  generate: generateMeetingIntelligence,
  generatorSnapshot: getMeetingIntelligenceGeneratorSnapshot,
  heartbeat: heartbeatMeetingIntelligenceRun,
  loadTranscript: loadMeetingIntelligenceTranscript,
  markFailed: markMeetingIntelligenceFailed,
  publish: publishMeetingIntelligence,
  saveCheckpoint: saveMeetingIntelligenceCheckpoint,
  saveProgress: saveMeetingIntelligenceProgress,
};
