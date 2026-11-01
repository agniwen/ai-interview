import { createMeetingIntelligenceDao } from "@app/meeting-processing/intelligence";
import { db } from "../../../infrastructure/db/index";

export const {
  claimMeetingIntelligenceRun,

  listMeetingsNeedingAutomaticIntelligence,

  loadMeetingIntelligenceResult,

  markMeetingIntelligenceFailed,
  publishMeetingIntelligence,
  requestMeetingIntelligenceRun,
  saveMeetingIntelligenceCheckpoint,
  saveMeetingIntelligenceProgress,
} = createMeetingIntelligenceDao(db);
