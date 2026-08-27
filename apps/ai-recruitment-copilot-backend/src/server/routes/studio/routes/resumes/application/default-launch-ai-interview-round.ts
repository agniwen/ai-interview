import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { buildScheduleRows } from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { autoBindApplicableTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import {
  flattenPresetQuestionsFromContextSnapshot,
  refreshInterviewContextSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import { setResumeEvaluationStatusWithAuditTx } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { createDefaultScheduleEntry } from "@arc/db-schema/studio-interviews";
import { canApplyCandidatePipelineEvent } from "@arc/shared/candidate-pipeline-machine";
import { canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import {
  createLaunchAiInterviewRound,
  isStructuredEvaluationConfirmationValid,
} from "./launch-ai-interview-round";
import type { PersistLaunchInput } from "./launch-ai-interview-round";
import { enqueueAiInterviewInvitedEvents } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/feature-flags";
import { applyAiInterviewInvitationValidityToSchedule } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/ai-interview-invitation-access";

export function persistLaunchAiInterviewRound(
  input: PersistLaunchInput<typeof studioInterviewSchedule.$inferInsert>,
) {
  // oxlint-disable-next-line complexity -- candidate gates, launch persistence, and invitation setup share one transaction boundary.
  return db.transaction(async (tx) => {
    const {
      actorId,
      candidateInviteValidity = "permanent",
      decisionAuditLogId,
      interviewRecordId,
      launchAuditLogId,
      now,
      organizationId,
      schedule,
      structuredEvaluationConfirmation,
      visibilityScope,
    } = input;
    const visibilityCondition =
      visibilityScope.kind === "restricted"
        ? inArray(studioInterview.createdBy, visibilityScope.userIds)
        : undefined;
    if (visibilityScope.kind === "none") {
      return { ok: false as const, reason: "not_found" as const };
    }

    const [candidate] = await tx
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        pipelineStage: studioInterview.pipelineStage,
        resumeEvaluationStatus: studioInterview.resumeEvaluationStatus,
        resumeParseStatus: studioInterview.resumeParseStatus,
        resumeReviewRunId: studioInterview.resumeReviewRunId,
        resumeReviewStatus: studioInterview.resumeReviewStatus,
        structuredGateStatus: studioInterview.structuredGateStatus,
        structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
        structuredScoreGrade: studioInterview.structuredScoreGrade,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, interviewRecordId),
          eq(studioInterview.organizationId, organizationId),
          visibilityCondition,
        ),
      )
      .limit(1)
      .for("update");
    if (!candidate) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (candidate.pipelineStage === "closed") {
      return { ok: false as const, reason: "closed_candidate" as const };
    }
    if (
      !canApplyCandidatePipelineEvent(
        {
          humanInterviewReadyForOffer: false,
          stage: candidate.pipelineStage,
        },
        { type: "START_AI_INTERVIEW" },
      )
    ) {
      return { ok: false as const, reason: "stage_conflict" as const };
    }
    if (!canLaunchInterviewFromResume(candidate.resumeParseStatus)) {
      return { ok: false as const, reason: "resume_not_ready" as const };
    }
    let currentStructuredEvaluation = null;
    if (
      candidate.structuredResumeEvaluation &&
      candidate.resumeReviewStatus === "ready" &&
      candidate.resumeReviewRunId === candidate.structuredResumeEvaluation.runId &&
      candidate.structuredGateStatus &&
      candidate.structuredScoreGrade
    ) {
      currentStructuredEvaluation = {
        gateStatus: candidate.structuredGateStatus,
        grade: candidate.structuredScoreGrade,
        runId: candidate.structuredResumeEvaluation.runId,
      };
    }
    if (
      (candidate.resumeReviewStatus === "ready" &&
        candidate.resumeReviewRunId === candidate.structuredResumeEvaluation?.runId &&
        candidate.structuredResumeEvaluation &&
        !currentStructuredEvaluation) ||
      !isStructuredEvaluationConfirmationValid(
        currentStructuredEvaluation,
        structuredEvaluationConfirmation,
      )
    ) {
      return {
        ok: false as const,
        reason: "structured_evaluation_confirmation_required" as const,
      };
    }

    const [activeRound] = await tx
      .select({ id: studioInterviewSchedule.id })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, interviewRecordId),
          eq(studioInterviewSchedule.organizationId, organizationId),
          inArray(studioInterviewSchedule.status, ["pending", "in_progress", "interrupted"]),
        ),
      )
      .limit(1);
    if (activeRound) {
      return { ok: false as const, reason: "stage_conflict" as const };
    }

    const notificationFlowEnabled = isInterviewNotificationFlowEnabled();
    const scheduleToInsert = applyAiInterviewInvitationValidityToSchedule(
      schedule,
      now,
      candidateInviteValidity,
    );
    await tx.insert(studioInterviewSchedule).values(scheduleToInsert);
    if (notificationFlowEnabled) {
      await enqueueAiInterviewInvitedEvents(tx, {
        actorUserId: actorId,
        now,
        scheduleEntryId: schedule.id,
      });
    }
    await setResumeEvaluationStatusWithAuditTx(tx, {
      auditLogId: decisionAuditLogId,
      auditUnchanged: true,
      currentStatus: candidate.resumeEvaluationStatus,
      id: interviewRecordId,
      now,
      operatorId: actorId,
      organizationId,
      status: "pass",
    });
    await tx
      .update(studioInterview)
      .set({
        pipelineStage: "ai_interview",
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, interviewRecordId),
          eq(studioInterview.organizationId, organizationId),
          visibilityCondition,
        ),
      );
    await autoBindApplicableTemplates(tx, interviewRecordId, candidate.jobDescriptionId);
    const snapshot = await refreshInterviewContextSnapshot(tx, {
      createdAt: now,
      createdBy: actorId,
      interviewRecordId,
      personalizedQuestions: [],
      reason: "create",
      scheduleEntryId: schedule.id,
    });
    const requiredQuestionCount = flattenPresetQuestionsFromContextSnapshot(
      snapshot.payload,
    ).length;
    await tx.insert(interviewAuditLog).values({
      action: "ai_interview_launched",
      createdAt: now,
      detail: {
        candidateInviteValidity,
        personalizedQuestionCount: 0,
        questionCount: requiredQuestionCount,
        roundId: schedule.id,
        roundLabel: schedule.roundLabel,
      },
      id: launchAuditLogId,
      interviewRecordId,
      operatorId: actorId,
      organizationId,
      scheduleEntryId: schedule.id,
    });

    return { ok: true as const, roundId: schedule.id };
  });
}

export const launchAiInterviewRound = createLaunchAiInterviewRound({
  buildSchedule: ({ actorId, interviewRecordId, now, organizationId, roundId }) => {
    const [schedule] = buildScheduleRows(
      organizationId,
      interviewRecordId,
      [{ ...createDefaultScheduleEntry(), id: roundId }],
      now,
      undefined,
      actorId,
    );
    return schedule ?? null;
  },
  clock: { now: () => new Date() },
  idGenerator: { next: () => crypto.randomUUID() },
  invalidateCache: invalidateStudioInterviewCaches,
  persist: persistLaunchAiInterviewRound,
});
