import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@app/server/lib/server/db";
import type { JsonObject } from "@arc/db-schema/json";
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { cacheTags, safeUpdateTag } from "@app/server/server/cache-tags";
import {
  notifyInterviewSummaryReady,
  retryFailedInterviewSummaryNotifications,
} from "@app/server/server/routes/agent/utils/feishu-interview-notifications";
import { runKeyInformationJob } from "@app/server/server/routes/agent/utils/interview-key-information-job";
import { runSummaryJob } from "@app/server/server/routes/agent/utils/interview-summary-job";
import { createInterviewEvidenceSnapshot } from "@app/server/server/routes/agent/utils/evidence-snapshot";
import { enqueueAiInterviewCompletedEvent } from "@app/server/server/routes/studio/routes/interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "@app/server/server/routes/studio/routes/interview-notifications/utils/feature-flags";
import { mergeInterviewEndReasonMetadata } from "@arc/shared/interview/end-reason";
import {
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import { createAgentRouter } from "./route";
import type {
  AgentRouterDependencies,
  CheckpointPayload,
  ReportPayload,
  ReportTranscript,
  RetrySummaryCandidate,
} from "./route";

const jsonObjectSchema = z.record(z.string(), z.json());
const undefinedColumnErrorSchema = z.object({
  cause: z.unknown().optional(),
  code: z.string().optional(),
});
const RECOVERY_BATCH_SIZE = 20;
const RECOVERY_MAX_ATTEMPTS = 5;

function isUndefinedColumnError(error: z.output<typeof undefinedColumnErrorSchema>): boolean {
  if (error.code === "42703") {
    return true;
  }
  const cause = undefinedColumnErrorSchema.safeParse(error.cause);
  return cause.success && isUndefinedColumnError(cause.data);
}

async function resolveOrgFromInterview(interviewRecordId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  if (!row) {
    throw new Error(`resolveOrgFromInterview: studio_interview ${interviewRecordId} not found`);
  }
  return row.organizationId;
}

async function hasKeyInformationColumns(): Promise<boolean> {
  try {
    await db
      .select({ keyInformationStatus: interviewConversation.keyInformationStatus })
      .from(interviewConversation)
      .limit(0);
    return true;
  } catch (error) {
    const parsedError = undefinedColumnErrorSchema.safeParse(error);
    if (parsedError.success && isUndefinedColumnError(parsedError.data)) {
      return false;
    }
    throw error;
  }
}

async function findExistingTranscript(conversationId: string): Promise<ReportTranscript | null> {
  const [row] = await db
    .select({ transcript: interviewConversation.transcript })
    .from(interviewConversation)
    .where(eq(interviewConversation.conversationId, conversationId))
    .limit(1);
  return row?.transcript ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function persistCheckpoint(options: {
  data: CheckpointPayload;
  now: Date;
  organizationId: string;
}): Promise<void> {
  const { data, now, organizationId } = options;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ dataCollectionResults: interviewConversation.dataCollectionResults })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, data.conversationId))
      .for("update")
      .limit(1);
    const current = parseInterviewDataCollectionResults(existing?.dataCollectionResults) ?? {
      questions: [],
      schemaVersion: 2 as const,
    };
    const merged = mergeInterviewQuestionOutcome(current, data.outcome);

    if (existing) {
      await tx
        .update(interviewConversation)
        .set({ dataCollectionResults: jsonObjectSchema.parse(merged), lastSyncedAt: now })
        .where(eq(interviewConversation.conversationId, data.conversationId));
      return;
    }

    await tx.insert(interviewConversation).values({
      conversationId: data.conversationId,
      dataCollectionResults: jsonObjectSchema.parse(merged),
      interviewRecordId: data.interviewRecordId,
      lastSyncedAt: now,
      mode: "voice",
      organizationId,
      scheduleEntryId: data.scheduleEntryId,
      status: "in_progress",
    });
  });
}

interface UpsertOptions {
  data: ReportPayload;
  isNewTranscript: boolean;
  keyInformationColumnsAvailable: boolean;
  metadata: JsonObject;
  now: Date;
  organizationId: string;
}

async function upsertLegacyInterviewConversation(tx: Tx, options: UpsertOptions): Promise<void> {
  const { data, isNewTranscript, metadata, now, organizationId } = options;
  await tx.execute(sql`
      insert into "interview_conversation" (
        "agent_id", "conversation_id", "interview_record_id", "mode",
        "organization_id", "schedule_entry_id"
      ) values (
        ${data.agentId ?? null}, ${data.conversationId}, ${data.interviewRecordId}, 'voice',
        ${organizationId}, ${data.scheduleEntryId}
      ) on conflict ("conversation_id") do nothing
    `);
  const updateValues = {
    callSuccessful: data.callSuccessful ?? null,
    endedAt: data.endedAt ? new Date(data.endedAt) : null,
    lastSyncedAt: now,
    metadata,
    metrics: data.metrics ?? {},
    startedAt: data.startedAt ? new Date(data.startedAt) : null,
    status: data.status,
    transcript: data.transcript,
    webhookReceivedAt: now,
  };
  if (isNewTranscript) {
    Object.assign(updateValues, {
      evaluationCriteriaResults: {},
      summaryAttempts: 0,
      summaryError: null,
      summaryStartedAt: null,
      summaryStatus: "pending" as const,
      transcriptSummary: null,
    });
  }
  if (data.recording) {
    Object.assign(updateValues, {
      recordingDurationSecs: data.recording.durationSecs ?? null,
      recordingEgressId: data.recording.egressId,
      recordingFileKey: data.recording.fileKey,
      recordingStatus: data.recording.status,
    });
  }
  if (data.dataCollectionResults) {
    Object.assign(updateValues, {
      dataCollectionResults: jsonObjectSchema.parse(data.dataCollectionResults),
    });
  }
  await tx
    .update(interviewConversation)
    .set(updateValues)
    .where(eq(interviewConversation.conversationId, data.conversationId));
}

async function upsertMigratedInterviewConversation(tx: Tx, options: UpsertOptions): Promise<void> {
  const { data, isNewTranscript, metadata, now, organizationId } = options;
  const summaryResetFields = isNewTranscript
    ? {
        evaluationCriteriaResults: {},
        keyInformation: null,
        keyInformationAttempts: 0,
        keyInformationError: null,
        keyInformationStartedAt: null,
        keyInformationStatus: "pending" as const,
        summaryAttempts: 0,
        summaryError: null,
        summaryStartedAt: null,
        summaryStatus: "pending" as const,
        transcriptSummary: null,
      }
    : {};
  const recordingFields = data.recording
    ? {
        recordingDurationSecs: data.recording.durationSecs ?? null,
        recordingEgressId: data.recording.egressId,
        recordingFileKey: data.recording.fileKey,
        recordingStatus: data.recording.status,
      }
    : {};
  const dataCollectionFields = data.dataCollectionResults
    ? { dataCollectionResults: jsonObjectSchema.parse(data.dataCollectionResults) }
    : {};

  await tx
    .insert(interviewConversation)
    .values({
      agentId: data.agentId ?? null,
      callSuccessful: data.callSuccessful ?? null,
      conversationId: data.conversationId,
      dataCollectionResults: data.dataCollectionResults
        ? jsonObjectSchema.parse(data.dataCollectionResults)
        : {},
      dynamicVariables: {},
      endedAt: data.endedAt ? new Date(data.endedAt) : null,
      interviewRecordId: data.interviewRecordId,
      lastSyncedAt: now,
      metadata,
      metrics: data.metrics ?? {},
      mode: "voice",
      organizationId,
      scheduleEntryId: data.scheduleEntryId,
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      status: data.status,
      summaryStatus: "pending",
      transcript: data.transcript,
      webhookReceivedAt: now,
      ...recordingFields,
    })
    .onConflictDoUpdate({
      set: {
        callSuccessful: data.callSuccessful ?? null,
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        lastSyncedAt: now,
        metadata,
        metrics: data.metrics ?? {},
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        status: data.status,
        transcript: data.transcript,
        webhookReceivedAt: now,
        ...summaryResetFields,
        ...recordingFields,
        ...dataCollectionFields,
      },
      target: interviewConversation.conversationId,
    });
}

async function upsertInterviewConversation(tx: Tx, options: UpsertOptions): Promise<void> {
  if (options.keyInformationColumnsAvailable) {
    await upsertMigratedInterviewConversation(tx, options);
    return;
  }
  await upsertLegacyInterviewConversation(tx, options);
}

async function persistReport(options: {
  data: ReportPayload;
  isNewTranscript: boolean;
  keyInformationColumnsAvailable: boolean;
  now: Date;
  organizationId: string;
}): Promise<void> {
  const { data, now, organizationId } = options;
  await db.transaction(async (tx) => {
    const [existingConversation] = await tx
      .select({ metadata: interviewConversation.metadata })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, data.conversationId))
      .for("update")
      .limit(1);
    const metadata = mergeInterviewEndReasonMetadata(existingConversation?.metadata, data.metadata);
    await upsertInterviewConversation(tx, { ...options, metadata });
    await tx
      .delete(interviewConversationTurn)
      .where(eq(interviewConversationTurn.conversationId, data.conversationId));
    if (data.transcript.length > 0) {
      const callStart = data.startedAt ? new Date(data.startedAt) : now;
      await tx.insert(interviewConversationTurn).values(
        data.transcript.map((turn, index) => ({
          conversationId: data.conversationId,
          createdAt: new Date(callStart.getTime() + (turn.timeInCallSecs ?? 0) * 1000),
          id: `${data.conversationId}:turn:${index}`,
          interviewRecordId: data.interviewRecordId,
          message: turn.message,
          organizationId,
          receivedAt: now,
          role: turn.role,
          source: "agent_report" as const,
          timeInCallSecs:
            turn.timeInCallSecs === null || turn.timeInCallSecs === undefined
              ? null
              : Math.round(turn.timeInCallSecs),
        })),
      );
    }
    await tx
      .update(studioInterviewSchedule)
      .set({ conversationId: data.conversationId, status: "completed", updatedAt: now })
      .where(
        and(
          eq(studioInterviewSchedule.id, data.scheduleEntryId),
          eq(studioInterviewSchedule.liveKitRoomName, data.conversationId),
        ),
      );
    if (isInterviewNotificationFlowEnabled()) {
      await enqueueAiInterviewCompletedEvent(tx, { scheduleEntryId: data.scheduleEntryId });
    }
    await tx.insert(interviewAuditLog).values({
      action: "agent_report_received",
      createdAt: now,
      detail: {
        callSuccessful: data.callSuccessful,
        conversationId: data.conversationId,
        turnCount: data.transcript.length,
      },
      id: crypto.randomUUID(),
      interviewRecordId: data.interviewRecordId,
      operatorId: null,
      organizationId,
      scheduleEntryId: data.scheduleEntryId,
    });
  });
}

function listSummaryRetryCandidates(staleThreshold: Date): Promise<RetrySummaryCandidate[]> {
  return db
    .select({
      conversationId: interviewConversation.conversationId,
      interviewRecordId: interviewConversation.interviewRecordId,
    })
    .from(interviewConversation)
    .where(
      and(
        or(
          inArray(interviewConversation.summaryStatus, ["pending", "failed"]),
          and(
            eq(interviewConversation.summaryStatus, "running"),
            lt(interviewConversation.summaryStartedAt, staleThreshold),
          ),
        ),
        lt(interviewConversation.updatedAt, staleThreshold),
        isNotNull(interviewConversation.interviewRecordId),
        lt(interviewConversation.summaryAttempts, RECOVERY_MAX_ATTEMPTS),
      ),
    )
    .limit(RECOVERY_BATCH_SIZE);
}

function listKeyInformationRetryCandidates(staleThreshold: Date): Promise<RetrySummaryCandidate[]> {
  return db
    .select({
      conversationId: interviewConversation.conversationId,
      interviewRecordId: interviewConversation.interviewRecordId,
    })
    .from(interviewConversation)
    .where(
      and(
        or(
          inArray(interviewConversation.keyInformationStatus, ["pending", "failed"]),
          and(
            eq(interviewConversation.keyInformationStatus, "running"),
            lt(interviewConversation.keyInformationStartedAt, staleThreshold),
          ),
        ),
        lt(interviewConversation.updatedAt, staleThreshold),
        isNotNull(interviewConversation.interviewRecordId),
        lt(interviewConversation.keyInformationAttempts, RECOVERY_MAX_ATTEMPTS),
      ),
    )
    .limit(RECOVERY_BATCH_SIZE);
}

const dependencies: AgentRouterDependencies = {
  cacheTags,
  createInterviewEvidenceSnapshot: async (options) => {
    await createInterviewEvidenceSnapshot(options);
  },
  findExistingTranscript,
  hasKeyInformationColumns,
  listKeyInformationRetryCandidates,
  listSummaryRetryCandidates,
  notifyInterviewSummaryReady,
  persistCheckpoint,
  persistReport,
  resolveOrgFromInterview,
  retryFailedInterviewSummaryNotifications,
  runKeyInformationJob,
  runSummaryJob,
  safeUpdateTag,
};

export const agentRouter = createAgentRouter(dependencies);
