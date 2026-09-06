import {
  lockAiRound,
  updateEffectiveAiProgress,
} from "../studio/routes/interviews/dao/ai-round-lifecycle";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../lib/server/db/index";
import type { JsonObject } from "@app/db-schema/json";
import {
  recruitingEvent,
  aiInterviewConversation,
  aiInterviewConversationTurn,
  aiInterviewRound,
} from "@app/db-schema/schema";
import { cacheTags, safeUpdateTag } from "../../cache-tags";
import {
  notifyInterviewSummaryReady,
  retryFailedInterviewSummaryNotifications,
} from "./utils/feishu-interview-notifications";
import { runKeyInformationJob } from "./utils/interview-key-information-job";
import { runSummaryJob } from "./utils/interview-summary-job";
import { createInterviewEvidenceSnapshot } from "./utils/evidence-snapshot";
import { enqueueAiInterviewCompletedEvent } from "../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../interview-notifications/utils/feature-flags";
import { mergeInterviewEndReasonMetadata } from "@app/shared/interview/end-reason";
import {
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@app/shared/interview/question-outcomes";
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
    .select({ organizationId: recruitingRecordReadModel.organizationId })
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, interviewRecordId))
    .limit(1);
  if (!row) {
    throw new Error(`resolveOrgFromInterview: studio_interview ${interviewRecordId} not found`);
  }
  return row.organizationId;
}

async function hasKeyInformationColumns(): Promise<boolean> {
  try {
    await db
      .select({ keyInformationStatus: aiInterviewConversation.keyInformationStatus })
      .from(aiInterviewConversation)
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
    .select({ transcript: aiInterviewConversation.transcript })
    .from(aiInterviewConversation)
    .where(eq(aiInterviewConversation.conversationId, conversationId))
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
    const locked = await lockAiRound(tx, data.scheduleEntryId, organizationId);
    if (!locked || locked.record.id !== data.interviewRecordId) {
      return;
    }
    const [existing] = await tx
      .select({ dataCollectionResults: aiInterviewConversation.dataCollectionResults })
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, data.conversationId))
      .for("update")
      .limit(1);
    const current = parseInterviewDataCollectionResults(existing?.dataCollectionResults) ?? {
      questions: [],
      schemaVersion: 2 as const,
    };
    const merged = mergeInterviewQuestionOutcome(current, data.outcome);

    if (existing) {
      await tx
        .update(aiInterviewConversation)
        .set({ dataCollectionResults: jsonObjectSchema.parse(merged), lastSyncedAt: now })
        .where(eq(aiInterviewConversation.conversationId, data.conversationId));
      return;
    }

    await tx.insert(aiInterviewConversation).values({
      aiRoundId: data.scheduleEntryId,
      conversationId: data.conversationId,
      dataCollectionResults: jsonObjectSchema.parse(merged),
      lastSyncedAt: now,
      mode: "voice",
      organizationId,
      recruitingRecordId: data.interviewRecordId,
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
    .insert(aiInterviewConversation)
    .values({
      agentId: data.agentId ?? null,
      aiRoundId: data.scheduleEntryId,
      callSuccessful: data.callSuccessful ?? null,
      conversationId: data.conversationId,
      dataCollectionResults: data.dataCollectionResults
        ? jsonObjectSchema.parse(data.dataCollectionResults)
        : {},
      dynamicVariables: {},
      endedAt: data.endedAt ? new Date(data.endedAt) : null,
      lastSyncedAt: now,
      metadata,
      metrics: data.metrics ?? {},
      mode: "voice",
      organizationId,
      recruitingRecordId: data.interviewRecordId,
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
      target: aiInterviewConversation.conversationId,
    });
}

function upsertInterviewConversation(tx: Tx, options: UpsertOptions): Promise<void> {
  return upsertMigratedInterviewConversation(tx, options);
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
    const locked = await lockAiRound(tx, data.scheduleEntryId, organizationId);
    if (!locked || locked.record.id !== data.interviewRecordId) {
      return;
    }
    const [existingConversation] = await tx
      .select({ metadata: aiInterviewConversation.metadata })
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, data.conversationId))
      .for("update")
      .limit(1);
    const metadata = mergeInterviewEndReasonMetadata(existingConversation?.metadata, data.metadata);
    await upsertInterviewConversation(tx, { ...options, metadata });
    await tx
      .delete(aiInterviewConversationTurn)
      .where(eq(aiInterviewConversationTurn.conversationId, data.conversationId));
    if (data.transcript.length > 0) {
      const callStart = data.startedAt ? new Date(data.startedAt) : now;
      await tx.insert(aiInterviewConversationTurn).values(
        data.transcript.map((turn, index) => ({
          conversationId: data.conversationId,
          createdAt: new Date(callStart.getTime() + (turn.timeInCallSecs ?? 0) * 1000),
          id: `${data.conversationId}:turn:${index}`,
          message: turn.message,
          organizationId,
          receivedAt: now,
          recruitingRecordId: data.interviewRecordId,
          role: turn.role,
          source: "agent_report" as const,
          timeInCallSecs:
            turn.timeInCallSecs === null || turn.timeInCallSecs === undefined
              ? null
              : Math.round(turn.timeInCallSecs),
        })),
      );
    }
    const completedRounds = await tx
      .update(aiInterviewRound)
      .set({ conversationId: data.conversationId, status: "completed", updatedAt: now })
      .where(
        and(
          eq(aiInterviewRound.id, data.scheduleEntryId),
          eq(aiInterviewRound.liveKitRoomName, data.conversationId),
        ),
      )
      .returning({ id: aiInterviewRound.id });
    if (completedRounds.length && locked.isEffective) {
      await updateEffectiveAiProgress(tx, data.scheduleEntryId, "awaiting_review");
    }
    if (completedRounds.length && locked.isEffective && isInterviewNotificationFlowEnabled()) {
      await enqueueAiInterviewCompletedEvent(tx, { scheduleEntryId: data.scheduleEntryId });
    }
    await tx.insert(recruitingEvent).values({
      action: "agent_report_received",
      aiRoundId: data.scheduleEntryId,
      createdAt: now,
      detail: {
        callSuccessful: data.callSuccessful,
        conversationId: data.conversationId,
        turnCount: data.transcript.length,
      },
      id: crypto.randomUUID(),
      operatorId: null,
      organizationId,
      recruitingRecordId: data.interviewRecordId,
    });
  });
}

function listSummaryRetryCandidates(staleThreshold: Date): Promise<RetrySummaryCandidate[]> {
  return db
    .select({
      conversationId: aiInterviewConversation.conversationId,
      interviewRecordId: aiInterviewConversation.recruitingRecordId,
    })
    .from(aiInterviewConversation)
    .where(
      and(
        or(
          inArray(aiInterviewConversation.summaryStatus, ["pending", "failed"]),
          and(
            eq(aiInterviewConversation.summaryStatus, "running"),
            lt(aiInterviewConversation.summaryStartedAt, staleThreshold),
          ),
        ),
        lt(aiInterviewConversation.updatedAt, staleThreshold),
        isNotNull(aiInterviewConversation.recruitingRecordId),
        lt(aiInterviewConversation.summaryAttempts, RECOVERY_MAX_ATTEMPTS),
      ),
    )
    .limit(RECOVERY_BATCH_SIZE);
}

function listKeyInformationRetryCandidates(staleThreshold: Date): Promise<RetrySummaryCandidate[]> {
  return db
    .select({
      conversationId: aiInterviewConversation.conversationId,
      interviewRecordId: aiInterviewConversation.recruitingRecordId,
    })
    .from(aiInterviewConversation)
    .where(
      and(
        or(
          inArray(aiInterviewConversation.keyInformationStatus, ["pending", "failed"]),
          and(
            eq(aiInterviewConversation.keyInformationStatus, "running"),
            lt(aiInterviewConversation.keyInformationStartedAt, staleThreshold),
          ),
        ),
        lt(aiInterviewConversation.updatedAt, staleThreshold),
        isNotNull(aiInterviewConversation.recruitingRecordId),
        lt(aiInterviewConversation.keyInformationAttempts, RECOVERY_MAX_ATTEMPTS),
      ),
    )
    .limit(RECOVERY_BATCH_SIZE);
}

export const agentRouterDependencies: AgentRouterDependencies = {
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

export const agentRouter = createAgentRouter(agentRouterDependencies);
