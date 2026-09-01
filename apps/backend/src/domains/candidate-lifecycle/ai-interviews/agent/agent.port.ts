import type { z } from "zod";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import type {
  questionCheckpointPayloadSchema,
  reportPayloadSchema,
  retryNotificationPayloadSchema,
} from "./agent.schemas.js";

export const AGENT_PORT = Symbol("AGENT_PORT");
export const AGENT_JOBS_PORT = Symbol("AGENT_JOBS_PORT");

export interface AgentJobsPort {
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

export interface AgentPort {
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
