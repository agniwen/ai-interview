import type { z } from "zod";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import type {
  questionCheckpointPayloadSchema,
  reportPayloadSchema,
  retryNotificationPayloadSchema,
} from "./agent.schemas.js";

export const TOP_LEVEL_AGENT_PORT = Symbol("TOP_LEVEL_AGENT_PORT");
export const TOP_LEVEL_AGENT_JOBS_PORT = Symbol("TOP_LEVEL_AGENT_JOBS_PORT");

export interface TopLevelAgentJobsPort {
  createEvidenceSnapshot(input: {
    conversationId: string;
    interviewRecordId: string;
  }): Promise<InterviewEvidenceSnapshotPayload | null>;
  enqueueInterviewCompleted(scheduleEntryId: string): Promise<void>;
  notifySummaryReady(input: { conversationId: string; interviewRecordId: string }): Promise<void>;
  retryFailedNotifications(): Promise<{ retried: number }>;
  runKeyInformation(input: { conversationId: string; interviewRecordId: string }): Promise<void>;
  runSummary(input: { conversationId: string; interviewRecordId: string }): Promise<void>;
}

export interface TopLevelAgentPort {
  persistCheckpoint(input: z.infer<typeof questionCheckpointPayloadSchema>): Promise<void>;
  persistReport(input: z.infer<typeof reportPayloadSchema>): Promise<{ conversationId: string }>;
  retryNotifications(
    input: z.infer<typeof retryNotificationPayloadSchema>,
  ): Promise<{ retried: number; scoped?: boolean }>;
  retrySummaries(): Promise<{
    keyInformation: { retried: number; scanned: number; skipped: number };
    retried: number;
    scanned: number;
    skipped: number;
  }>;
}
