/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, no-nested-ternary, unicorn/prefer-structured-clone -- Provider payload normalization and immutable interview-report snapshots preserve the copied agent contract at this external boundary. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewContextSnapshot,
  interviewConversation,
  interviewEvidenceSnapshot,
  interviewNotification,
  globalConfig,
  organization,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import type { JsonObject } from "@arc/db-schema/json";
import { buildInterviewNotificationDedupeKey } from "@arc/shared/interview-notifications";
import {
  hasExistingInterviewAnswers,
  isInterviewQuestionSetComplete,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import { enqueuePreparedNotificationEvent } from "../notification-preparation.js";
import type { TopLevelAgentJobsPort } from "./agent.port.js";
import {
  evaluationQuestions,
  formResponses,
  generateInterviewKeyInformation,
  generateInterviewReport,
} from "./interview-report.js";

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function notificationFlowEnabled() {
  return ["1", "true", "yes"].includes(
    rawBackendEnvironment.INTERVIEW_NOTIFICATION_FLOW_ENABLED?.trim().toLocaleLowerCase() ?? "",
  );
}

function reportUrl(roundId: string, organizationSlug: string) {
  const baseUrl =
    rawBackendEnvironment.BETTER_AUTH_URL?.trim() ||
    rawBackendEnvironment.NEXT_PUBLIC_BASE_URL?.trim();
  const pathname = `/w/${encodeURIComponent(organizationSlug)}/studio/interviews?roundId=${encodeURIComponent(roundId)}`;
  return baseUrl ? `${baseUrl.replace(/\/$/u, "")}${pathname}` : undefined;
}

const RUNNING_STALE_MINUTES = 10;

@Injectable()
export class AgentJobsService implements TopLevelAgentJobsPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
  ) {}

  async createEvidenceSnapshot(input: { conversationId: string; interviewRecordId: string }) {
    const [[context], [conversation], submissions] = await Promise.all([
      this.database
        .select()
        .from(interviewContextSnapshot)
        .where(
          and(
            eq(interviewContextSnapshot.interviewRecordId, input.interviewRecordId),
            eq(interviewContextSnapshot.status, "active"),
          ),
        )
        .orderBy(desc(interviewContextSnapshot.version))
        .limit(1),
      this.database
        .select()
        .from(interviewConversation)
        .where(eq(interviewConversation.conversationId, input.conversationId))
        .limit(1),
      this.database
        .select()
        .from(candidateFormSubmission)
        .where(eq(candidateFormSubmission.interviewRecordId, input.interviewRecordId)),
    ]);
    if (!(context && conversation)) {
      return null;
    }
    const formsByVersion = new Map(context.payload.forms.map((form) => [form.versionId, form]));
    const payload: InterviewEvidenceSnapshotPayload = {
      context: context.payload,
      contextSnapshotId: context.id,
      conversationId: conversation.conversationId,
      formSubmissions: submissions.flatMap((submission) => {
        const form = formsByVersion.get(submission.versionId);
        return form
          ? [
              {
                answers: submission.answers,
                snapshot: form.snapshot,
                submittedAt: submission.submittedAt.toISOString(),
                templateId: submission.templateId,
                version: form.version,
                versionId: submission.versionId,
              },
            ]
          : [];
      }),
      generatedAt: new Date().toISOString(),
      interviewRecordId: input.interviewRecordId,
      recording: {
        durationSecs: conversation.recordingDurationSecs,
        egressId: conversation.recordingEgressId,
        fileKey: conversation.recordingFileKey,
        status: conversation.recordingStatus,
      },
      scheduleEntryId: conversation.scheduleEntryId,
      schemaVersion: 1,
      transcript: conversation.transcript,
    };
    await this.database
      .insert(interviewEvidenceSnapshot)
      .values({
        contentHash: hashPayload(payload),
        contextSnapshotId: context.id,
        conversationId: input.conversationId,
        id: crypto.randomUUID(),
        interviewRecordId: input.interviewRecordId,
        organizationId: conversation.organizationId,
        payload,
        scheduleEntryId: conversation.scheduleEntryId,
      })
      .onConflictDoNothing();
    return payload;
  }

  async enqueueInterviewCompleted(scheduleEntryId: string) {
    const [context] = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        companyName: globalConfig.companyName,
        conversationId: studioInterviewSchedule.conversationId,
        createdBy: studioInterviewSchedule.createdBy,
        interviewRecordId: studioInterview.id,
        jobName: studioInterview.targetRole,
        organizationId: studioInterview.organizationId,
        organizationSlug: organization.slug,
        roundLabel: studioInterviewSchedule.roundLabel,
        workspaceName: organization.name,
      })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
      .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
      .where(eq(studioInterviewSchedule.id, scheduleEntryId))
      .limit(1);
    if (!context) {
      return;
    }
    const [conversation] = context.conversationId
      ? await this.database
          .select({ dataCollectionResults: interviewConversation.dataCollectionResults })
          .from(interviewConversation)
          .where(eq(interviewConversation.conversationId, context.conversationId))
          .limit(1)
      : [];
    const outcomes = parseInterviewDataCollectionResults(conversation?.dataCollectionResults);
    const complete = isInterviewQuestionSetComplete(outcomes);
    const completionNotice = complete
      ? `${context.candidateName} 已完成 AI 面试，报告生成后将另行通知。`
      : hasExistingInterviewAnswers(outcomes)
        ? "候选人已结束 AI 面试，但部分问题未完成，系统未自动生成候选人评价表。可前往 AI 面试列表，根据已有回答生成。"
        : "候选人已结束 AI 面试，但未产生有效回答，无法生成候选人评价表。可前往 AI 面试列表查看面试记录。";
    await this.database.transaction(async (transaction) => {
      await enqueuePreparedNotificationEvent(transaction, {
        actorUserId: context.createdBy,
        conversationId: context.conversationId,
        dedupeKey: buildInterviewNotificationDedupeKey({
          scopeId: scheduleEntryId,
          type: "ai_interview_completed",
          version: 1,
        }),
        id: crypto.randomUUID(),
        interviewRecordId: context.interviewRecordId,
        organizationId: context.organizationId,
        payloadSnapshot: {
          candidateName: context.candidateName,
          companyName: context.companyName?.trim() || context.workspaceName,
          completionNotice,
          interviewLink: complete
            ? undefined
            : reportUrl(scheduleEntryId, context.organizationSlug),
          interviewType: "ai",
          jobName: context.jobName ?? undefined,
          roundName: context.roundLabel,
          schemaVersion: 1,
          timeZone: "Asia/Shanghai",
        },
        scheduleEntryId,
        scopeType: "ai_round",
        type: "ai_interview_completed",
      });
      await transaction.insert(interviewAuditLog).values({
        action: "agent_interview_completed_enqueued",
        detail: { conversationId: context.conversationId },
        id: crypto.randomUUID(),
        interviewRecordId: context.interviewRecordId,
        operatorId: null,
        organizationId: context.organizationId,
        scheduleEntryId,
      });
    });
  }

  async notifySummaryReady(input: { conversationId: string; interviewRecordId: string }) {
    await this.database
      .update(interviewNotification)
      .set({
        error: null,
        lastErrorCode: null,
        nextAttemptAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(interviewNotification.conversationId, input.conversationId),
          eq(interviewNotification.interviewRecordId, input.interviewRecordId),
          inArray(interviewNotification.status, ["failed", "unknown"]),
        ),
      );
  }

  async retryFailedNotifications() {
    const rows = await this.database
      .update(interviewNotification)
      .set({
        error: null,
        lastErrorCode: null,
        nextAttemptAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(inArray(interviewNotification.status, ["failed", "unknown"]))
      .returning({ id: interviewNotification.id });
    return { retried: rows.length };
  }

  async runSummary(input: { conversationId: string; interviewRecordId: string }) {
    const startedAt = new Date();
    const staleThreshold = new Date(startedAt.getTime() - RUNNING_STALE_MINUTES * 60_000);
    const claimed = await this.database
      .update(interviewConversation)
      .set({
        summaryAttempts: sql`${interviewConversation.summaryAttempts} + 1`,
        summaryError: null,
        summaryStartedAt: startedAt,
        summaryStatus: "running",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, input.conversationId),
          or(
            inArray(interviewConversation.summaryStatus, ["pending", "failed"]),
            and(
              eq(interviewConversation.summaryStatus, "running"),
              lt(interviewConversation.summaryStartedAt, staleThreshold),
            ),
          ),
        ),
      )
      .returning({
        dataCollectionResults: interviewConversation.dataCollectionResults,
        transcript: interviewConversation.transcript,
      });
    if (claimed.length === 0) {
      return;
    }
    try {
      const [conversation] = claimed;
      if (conversation.transcript.length === 0) {
        throw new Error("empty transcript");
      }
      const evidence = await this.createEvidenceSnapshot(input);
      if (!evidence) {
        throw new Error("interview evidence snapshot is unavailable");
      }
      const report = await generateInterviewReport({
        candidateFormResponses: formResponses(evidence),
        dataCollectionResults: conversation.dataCollectionResults,
        questions: evaluationQuestions(evidence.context),
        transcript: conversation.transcript,
      });
      if (!(report.summary && report.evaluation)) {
        const generationError =
          [report.summaryError, report.evaluationError].filter(Boolean).join(" | ") ||
          "interview report generation was incomplete";
        await this.database
          .update(interviewConversation)
          .set({
            evaluationCriteriaResults: report.evaluation
              ? (JSON.parse(JSON.stringify(report.evaluation)) as JsonObject)
              : undefined,
            summaryError: generationError,
            summaryStatus: "failed",
            transcriptSummary: report.summary ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(interviewConversation.conversationId, input.conversationId),
              eq(interviewConversation.summaryStartedAt, startedAt),
            ),
          );
        return;
      }
      let committed = false;
      await this.database.transaction(async (transaction) => {
        const persisted = await transaction
          .update(interviewConversation)
          .set({
            evaluationCriteriaResults: JSON.parse(JSON.stringify(report.evaluation)) as JsonObject,
            summaryAttempts: 0,
            summaryError: null,
            summaryStatus: "ready",
            transcriptSummary: report.summary,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(interviewConversation.conversationId, input.conversationId),
              eq(interviewConversation.summaryStartedAt, startedAt),
            ),
          )
          .returning({ conversationId: interviewConversation.conversationId });
        if (persisted.length === 0) {
          return;
        }
        committed = true;
        if (
          notificationFlowEnabled() &&
          isInterviewQuestionSetComplete(
            parseInterviewDataCollectionResults(conversation.dataCollectionResults),
          )
        ) {
          const [context] = await transaction
            .select({
              candidateName: studioInterview.candidateName,
              companyName: globalConfig.companyName,
              createdBy: studioInterviewSchedule.createdBy,
              jobName: studioInterview.targetRole,
              organizationId: studioInterview.organizationId,
              organizationSlug: organization.slug,
              roundLabel: studioInterviewSchedule.roundLabel,
              scheduleEntryId: interviewConversation.scheduleEntryId,
              userName: user.name,
              workspaceName: organization.name,
            })
            .from(interviewConversation)
            .innerJoin(
              studioInterview,
              eq(studioInterview.id, interviewConversation.interviewRecordId),
            )
            .innerJoin(
              studioInterviewSchedule,
              eq(studioInterviewSchedule.id, interviewConversation.scheduleEntryId),
            )
            .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
            .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
            .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
            .where(eq(interviewConversation.conversationId, input.conversationId))
            .limit(1);
          if (context?.scheduleEntryId) {
            await enqueuePreparedNotificationEvent(transaction, {
              actorUserId: context.createdBy,
              conversationId: input.conversationId,
              dedupeKey: buildInterviewNotificationDedupeKey({
                scopeId: input.conversationId,
                type: "ai_report_ready",
                version: 1,
              }),
              id: crypto.randomUUID(),
              interviewRecordId: input.interviewRecordId,
              organizationId: context.organizationId,
              payloadSnapshot: {
                candidateName: context.candidateName,
                companyName: context.companyName?.trim() || context.workspaceName,
                initiatorName: context.userName ?? undefined,
                interviewLink: reportUrl(context.scheduleEntryId, context.organizationSlug),
                interviewType: "ai",
                jobName: context.jobName ?? undefined,
                roundName: context.roundLabel,
                schemaVersion: 1,
                timeZone: "Asia/Shanghai",
              },
              scheduleEntryId: context.scheduleEntryId,
              scopeType: "ai_round",
              type: "ai_report_ready",
            });
          }
        }
      });
      if (committed) {
        await this.notifySummaryReady(input);
      }
    } catch (error) {
      await this.database
        .update(interviewConversation)
        .set({
          summaryError: error instanceof Error ? error.message : "summary generation failed",
          summaryStatus: "failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviewConversation.conversationId, input.conversationId),
            eq(interviewConversation.summaryStartedAt, startedAt),
          ),
        );
    }
  }

  async runKeyInformation(input: { conversationId: string; interviewRecordId: string }) {
    const startedAt = new Date();
    const staleThreshold = new Date(startedAt.getTime() - RUNNING_STALE_MINUTES * 60_000);
    const claimed = await this.database
      .update(interviewConversation)
      .set({
        keyInformationAttempts: sql`${interviewConversation.keyInformationAttempts} + 1`,
        keyInformationError: null,
        keyInformationStartedAt: startedAt,
        keyInformationStatus: "running",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, input.conversationId),
          or(
            inArray(interviewConversation.keyInformationStatus, ["pending", "failed"]),
            and(
              eq(interviewConversation.keyInformationStatus, "running"),
              lt(interviewConversation.keyInformationStartedAt, staleThreshold),
            ),
          ),
        ),
      )
      .returning({ transcript: interviewConversation.transcript });
    if (claimed.length === 0) {
      return;
    }
    try {
      const [conversation] = claimed;
      const evidence = await this.createEvidenceSnapshot(input);
      if (!evidence) {
        throw new Error("interview evidence snapshot is unavailable");
      }
      const keyInformation = await generateInterviewKeyInformation({
        context: evidence.context,
        transcript: conversation.transcript,
      });
      await this.database
        .update(interviewConversation)
        .set({
          keyInformation,
          keyInformationAttempts: 0,
          keyInformationError: null,
          keyInformationStatus: "ready",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviewConversation.conversationId, input.conversationId),
            eq(interviewConversation.keyInformationStartedAt, startedAt),
          ),
        );
    } catch (error) {
      await this.database
        .update(interviewConversation)
        .set({
          keyInformationError:
            error instanceof Error ? error.message : "key information generation failed",
          keyInformationStatus: "failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviewConversation.conversationId, input.conversationId),
            eq(interviewConversation.keyInformationStartedAt, startedAt),
          ),
        );
    }
  }
}
