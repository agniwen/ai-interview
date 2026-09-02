import {
  createHumanInterviewEvaluationWorkerDao,
  createHumanInterviewRecordingDao,
  createMeetingTranscriptLoader,
  createRequestAutomaticHumanInterviewEvaluation,
} from "@app/meeting-processing/human-interview";
import {
  createMeetingIntelligenceDao,
  createRequestAutomaticMeetingIntelligence,
  getMeetingIntelligenceGeneratorSnapshot,
} from "@app/meeting-processing/intelligence";
import { createMeetingPurgeDao } from "@app/meeting-processing/purge";
import {
  createMeetingTranscriptionDao,
  rebuildMeetingSearchProjection,
} from "@app/meeting-processing/transcription";
import { db } from "./db";

export const meetingTranscriptionDao = createMeetingTranscriptionDao(db, {
  isWorkspaceAdministrator: (role) => role === "admin" || role === "owner",
  rebuildMeetingSearchProjection,
});

export const meetingIntelligenceDao = createMeetingIntelligenceDao(db);
export const meetingPurgeDao = createMeetingPurgeDao(db);
export const humanInterviewRecordingDao = createHumanInterviewRecordingDao(db);
export const humanInterviewEvaluationDao = createHumanInterviewEvaluationWorkerDao(db, {
  loadMeetingTranscriptForEvaluation: createMeetingTranscriptLoader(db),
});

export const requestAutomaticMeetingIntelligence = createRequestAutomaticMeetingIntelligence({
  getGeneratorSnapshot: getMeetingIntelligenceGeneratorSnapshot,
  loadResult: meetingIntelligenceDao.loadMeetingIntelligenceResult,
  requestRun: meetingIntelligenceDao.requestMeetingIntelligenceRun,
});

export const requestAutomaticHumanInterviewEvaluation =
  createRequestAutomaticHumanInterviewEvaluation({
    requestEvaluation: humanInterviewEvaluationDao.requestHumanInterviewEvaluation,
  });
