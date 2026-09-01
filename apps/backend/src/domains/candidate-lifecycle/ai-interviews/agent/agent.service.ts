/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- The Drizzle transaction result is narrowed only after the transaction establishes the claimed row invariant. */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { JsonObject } from "@arc/db-schema/json";
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { mergeInterviewEndReasonMetadata } from "@arc/shared/interview/end-reason";
import {
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import { HTTP_DATABASE } from "../../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../../infrastructure/http/http.ports.js";
import { AGENT_JOBS_PORT } from "./agent.port.js";
import type { AgentJobsPort, AgentPort } from "./agent.port.js";
import type {
  questionCheckpointPayloadSchema,
  reportPayloadSchema,
  retryNotificationPayloadSchema,
} from "./agent.schemas.js";

const jsonObjectSchema = z.record(z.string(), z.json());
const RECOVERY_BATCH_SIZE = 20;
const RECOVERY_MAX_ATTEMPTS = 5;

@Injectable()
export class AgentService implements AgentPort {
  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
    @Inject(AGENT_JOBS_PORT)
    private readonly jobs: AgentJobsPort,
  ) {}

  async persistCheckpoint(data: z.infer<typeof questionCheckpointPayloadSchema>): Promise<void> {
    const organizationId = await this.resolveOrganization(data.interviewRecordId);
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ dataCollectionResults: interviewConversation.dataCollectionResults })
        .from(interviewConversation)
        .where(eq(interviewConversation.conversationId, data.conversationId))
        .for("update")
        .limit(1);
      const current = parseInterviewDataCollectionResults(existing?.dataCollectionResults) ?? {
        questions: [],
        schemaVersion: 2 as const,
      };
      const merged = jsonObjectSchema.parse(mergeInterviewQuestionOutcome(current, data.outcome));
      if (existing) {
        await transaction
          .update(interviewConversation)
          .set({ dataCollectionResults: merged, lastSyncedAt: now })
          .where(eq(interviewConversation.conversationId, data.conversationId));
        return;
      }
      await transaction.insert(interviewConversation).values({
        conversationId: data.conversationId,
        dataCollectionResults: merged,
        interviewRecordId: data.interviewRecordId,
        lastSyncedAt: now,
        mode: "voice",
        organizationId,
        scheduleEntryId: data.scheduleEntryId,
        status: "in_progress",
      });
    });
  }

  async persistReport(data: z.infer<typeof reportPayloadSchema>) {
    const organizationId = await this.resolveOrganization(data.interviewRecordId);
    const now = new Date();
    const [existing] = await this.database
      .select({
        metadata: interviewConversation.metadata,
        transcript: interviewConversation.transcript,
      })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, data.conversationId))
      .limit(1);
    const transcriptChanged =
      !existing || JSON.stringify(existing.transcript) !== JSON.stringify(data.transcript);
    const metadata = mergeInterviewEndReasonMetadata(
      existing?.metadata,
      data.metadata,
    ) as JsonObject;
    const summaryReset = transcriptChanged
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
    const recording = data.recording
      ? {
          recordingDurationSecs: data.recording.durationSecs ?? null,
          recordingEgressId: data.recording.egressId,
          recordingFileKey: data.recording.fileKey,
          recordingStatus: data.recording.status,
        }
      : {};

    await this.database.transaction(async (transaction) => {
      await transaction
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
          ...recording,
        })
        .onConflictDoUpdate({
          set: {
            callSuccessful: data.callSuccessful ?? null,
            dataCollectionResults: data.dataCollectionResults
              ? jsonObjectSchema.parse(data.dataCollectionResults)
              : undefined,
            endedAt: data.endedAt ? new Date(data.endedAt) : null,
            lastSyncedAt: now,
            metadata,
            metrics: data.metrics ?? {},
            startedAt: data.startedAt ? new Date(data.startedAt) : null,
            status: data.status,
            transcript: data.transcript,
            webhookReceivedAt: now,
            ...summaryReset,
            ...recording,
          },
          target: interviewConversation.conversationId,
        });
      await transaction
        .delete(interviewConversationTurn)
        .where(eq(interviewConversationTurn.conversationId, data.conversationId));
      if (data.transcript.length > 0) {
        const callStart = data.startedAt ? new Date(data.startedAt) : now;
        await transaction.insert(interviewConversationTurn).values(
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
              turn.timeInCallSecs === undefined ? null : Math.round(turn.timeInCallSecs),
          })),
        );
      }
      await transaction
        .update(studioInterviewSchedule)
        .set({ conversationId: data.conversationId, status: "completed", updatedAt: now })
        .where(
          and(
            eq(studioInterviewSchedule.id, data.scheduleEntryId),
            eq(studioInterviewSchedule.liveKitRoomName, data.conversationId),
          ),
        );
      await transaction.insert(interviewAuditLog).values({
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

    await this.jobs.createEvidenceSnapshot({
      conversationId: data.conversationId,
      interviewRecordId: data.interviewRecordId,
    });
    await this.jobs.enqueueInterviewCompleted(data.scheduleEntryId);
    if (transcriptChanged) {
      void this.jobs.runSummary({
        conversationId: data.conversationId,
        interviewRecordId: data.interviewRecordId,
      });
      void this.jobs.runKeyInformation({
        conversationId: data.conversationId,
        interviewRecordId: data.interviewRecordId,
      });
    }
    return { conversationId: data.conversationId };
  }

  async retryNotifications(input: z.infer<typeof retryNotificationPayloadSchema>) {
    if (input.conversationId && input.interviewRecordId) {
      await this.jobs.notifySummaryReady({
        conversationId: input.conversationId,
        interviewRecordId: input.interviewRecordId,
      });
      return { retried: 1, scoped: true };
    }
    return this.jobs.retryFailedNotifications();
  }

  async retrySummaries() {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
    const base = and(
      lt(interviewConversation.updatedAt, staleThreshold),
      isNotNull(interviewConversation.interviewRecordId),
    );
    const [summaries, keyInformation] = await Promise.all([
      this.database
        .select({
          conversationId: interviewConversation.conversationId,
          interviewRecordId: interviewConversation.interviewRecordId,
        })
        .from(interviewConversation)
        .where(
          and(
            base,
            or(
              inArray(interviewConversation.summaryStatus, ["pending", "failed"]),
              and(
                eq(interviewConversation.summaryStatus, "running"),
                lt(interviewConversation.summaryStartedAt, staleThreshold),
              ),
            ),
            lt(interviewConversation.summaryAttempts, RECOVERY_MAX_ATTEMPTS),
          ),
        )
        .limit(RECOVERY_BATCH_SIZE),
      this.database
        .select({
          conversationId: interviewConversation.conversationId,
          interviewRecordId: interviewConversation.interviewRecordId,
        })
        .from(interviewConversation)
        .where(
          and(
            base,
            or(
              inArray(interviewConversation.keyInformationStatus, ["pending", "failed"]),
              and(
                eq(interviewConversation.keyInformationStatus, "running"),
                lt(interviewConversation.keyInformationStartedAt, staleThreshold),
              ),
            ),
            lt(interviewConversation.keyInformationAttempts, RECOVERY_MAX_ATTEMPTS),
          ),
        )
        .limit(RECOVERY_BATCH_SIZE),
    ]);
    for (const row of summaries) {
      if (row.interviewRecordId) {
        void this.jobs.runSummary({
          conversationId: row.conversationId,
          interviewRecordId: row.interviewRecordId,
        });
      }
    }
    for (const row of keyInformation) {
      if (row.interviewRecordId) {
        void this.jobs.runKeyInformation({
          conversationId: row.conversationId,
          interviewRecordId: row.interviewRecordId,
        });
      }
    }
    return {
      keyInformation: {
        retried: keyInformation.length,
        scanned: keyInformation.length,
        skipped: 0,
      },
      retried: summaries.length,
      scanned: summaries.length,
      skipped: 0,
    };
  }

  private async resolveOrganization(interviewRecordId: string): Promise<string> {
    const [record] = await this.database
      .select({ organizationId: studioInterview.organizationId })
      .from(studioInterview)
      .where(eq(studioInterview.id, interviewRecordId))
      .limit(1);
    if (!record) {
      throw new NotFoundException("Interview record not found", {
        errorCode: "INTERVIEW_RECORD_NOT_FOUND",
      });
    }
    return record.organizationId;
  }
}
