import { createMeetingIntelligenceDao } from "@app/meeting-processing/intelligence";
import { db } from "../../../../lib/server/db/index";

export const {
  claimMeetingIntelligenceRun,
  heartbeatMeetingIntelligenceRun,
  listMeetingsNeedingAutomaticIntelligence,
  listRecoverableMeetingIntelligenceJobs,
  loadMeetingIntelligenceResult,
  loadMeetingIntelligenceTranscript,
  markMeetingIntelligenceFailed,
  publishMeetingIntelligence,
  requestMeetingIntelligenceRun,
  saveMeetingIntelligenceCheckpoint,
  saveMeetingIntelligenceProgress,
} = createMeetingIntelligenceDao(db);
