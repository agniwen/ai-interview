import { lockRecruitingRecord } from "@app/database/recruiting-records";
import {
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { recruitingNodeState, recruitingEvent, aiInterviewRound } from "@app/db-schema/schema";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { invalidateStudioInterviewCaches } from "../../../../../cache-tags";
import { buildScheduleRows } from "../../../../interview/utils";
import { autoBindApplicableTemplates } from "../../interview-questions/dao/bindings";
import {
  flattenPresetQuestionsFromContextSnapshot,
  refreshInterviewContextSnapshot,
} from "../../interviews/dao/context-snapshots";
import { createDefaultScheduleEntry } from "@app/db-schema/studio-interviews";
import { canLaunchInterviewFromResume } from "@app/shared/studio-resumes";
import {
  createLaunchAiInterviewRound,
  isStructuredEvaluationConfirmationValid,
} from "./launch-ai-interview-round";
import type { PersistLaunchInput } from "./launch-ai-interview-round";
import { enqueueAiInterviewInvitedEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
import { applyAiInterviewInvitationValidityToSchedule } from "../../interviews/dao/ai-interview-invitation-access";

export function persistLaunchAiInterviewRound(
  input: PersistLaunchInput<typeof aiInterviewRound.$inferInsert>,
) {
  // oxlint-disable-next-line complexity -- candidate gates, launch persistence, and invitation setup share one transaction boundary.
  return db.transaction(async (tx) => {
    const {
      actorId,
      candidateInviteValidity = "permanent",
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
        ? inArray(recruitingRecordReadModel.createdBy, visibilityScope.userIds)
        : undefined;
    if (visibilityScope.kind === "none") {
      return { ok: false as const, reason: "not_found" as const };
    }

    await lockRecruitingRecord(tx, interviewRecordId, organizationId);
    const [candidate] = await tx
      .select({
        jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
        resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus,
        resumeParseStatus: recruitingRecordReadModel.resumeParseStatus,
        resumeReviewRunId: recruitingRecordReadModel.resumeReviewRunId,
        resumeReviewStatus: recruitingRecordReadModel.resumeReviewStatus,
        structuredGateStatus: recruitingRecordReadModel.structuredGateStatus,
        structuredResumeEvaluation: recruitingRecordReadModel.structuredResumeEvaluation,
        structuredScoreGrade: recruitingRecordReadModel.structuredScoreGrade,
      })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, interviewRecordId),
          eq(recruitingRecordReadModel.organizationId, organizationId),
          visibilityCondition,
        ),
      )
      .limit(1);
    if (!candidate) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (candidate.pipelineStage === "closed") {
      return { ok: false as const, reason: "closed_candidate" as const };
    }
    if (candidate.pipelineStage !== "screening" && candidate.pipelineStage !== "ai_interview") {
      return { ok: false as const, reason: "stage_conflict" as const };
    }
    if (candidate.resumeEvaluationStatus !== "pass") {
      return { ok: false as const, reason: "screening_not_passed" as const };
    }
    if (
      !canLaunchInterviewFromResume(
        candidate.resumeParseStatus,
        candidate.pipelineStage,
        candidate.resumeEvaluationStatus,
      )
    ) {
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
      .select({ id: aiInterviewRound.id })
      .from(aiInterviewRound)
      .innerJoin(
        recruitingNodeState,
        and(
          eq(recruitingNodeState.recruitingRecordId, aiInterviewRound.recruitingRecordId),
          eq(recruitingNodeState.node, "ai_interview"),
          eq(recruitingNodeState.effectiveAiRoundId, aiInterviewRound.id),
        ),
      )
      .where(
        and(
          eq(aiInterviewRound.recruitingRecordId, interviewRecordId),
          eq(aiInterviewRound.organizationId, organizationId),
          inArray(aiInterviewRound.status, ["pending", "in_progress", "interrupted"]),
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
    await tx.insert(aiInterviewRound).values(scheduleToInsert);
    if (notificationFlowEnabled) {
      await enqueueAiInterviewInvitedEvents(tx, {
        actorUserId: actorId,
        now,
        scheduleEntryId: schedule.id,
      });
    }
    if (candidate.pipelineStage === "screening") {
      await transitionRecruitingNodeTx(tx, {
        now,
        operatorId: actorId,
        organizationId,
        recordId: interviewRecordId,
        targetNode: "ai_interview",
      });
    }
    await updateRecruitingNodeTx(tx, {
      effectiveAiRoundId: schedule.id,
      node: "ai_interview",
      now,
      operatorId: actorId,
      organizationId,
      recordId: interviewRecordId,
      status: schedule.scheduledAt ? "scheduled" : "pending",
    });
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
    await tx.insert(recruitingEvent).values({
      action: "ai_interview_launched",
      aiRoundId: schedule.id,
      createdAt: now,
      detail: {
        candidateInviteValidity,
        personalizedQuestionCount: 0,
        questionCount: requiredQuestionCount,
        roundId: schedule.id,
        roundLabel: schedule.roundLabel,
      },
      id: launchAuditLogId,
      operatorId: actorId,
      organizationId,
      recruitingRecordId: interviewRecordId,
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
