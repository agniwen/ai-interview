import { randomUUID } from "node:crypto";
import {
  generateMeetingIntelligence,
  getMeetingIntelligenceGeneratorSnapshot,
} from "@app/meeting-processing/intelligence";
import { meetingIntelligenceDao as intelligenceDao } from "../meeting-processing-daos";
import type { MeetingIntelligenceDependencies } from "./processor";

export const defaultMeetingIntelligenceDependencies: MeetingIntelligenceDependencies = {
  claim: intelligenceDao.claimMeetingIntelligenceRun,
  createExecutionToken: randomUUID,
  generate: generateMeetingIntelligence,
  generatorSnapshot: getMeetingIntelligenceGeneratorSnapshot,
  heartbeat: intelligenceDao.heartbeatMeetingIntelligenceRun,
  loadTranscript: intelligenceDao.loadMeetingIntelligenceTranscript,
  markFailed: intelligenceDao.markMeetingIntelligenceFailed,
  publish: intelligenceDao.publishMeetingIntelligence,
  saveCheckpoint: intelligenceDao.saveMeetingIntelligenceCheckpoint,
  saveProgress: intelligenceDao.saveMeetingIntelligenceProgress,
};
