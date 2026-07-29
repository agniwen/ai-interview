import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { buildScheduleRows } from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import {
  flattenPresetQuestionsFromContextSnapshot,
  loadOrCreateActiveInterviewContextSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import { autoBindApplicableTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import { loadResumeDetail } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { createDefaultScheduleEntry } from "@arc/db-schema/studio-interviews";
import { createLaunchAiInterviewRound } from "./launch-ai-interview-round";

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
  commit: async ({
    actorId,
    auditLogId,
    interviewQuestions,
    interviewRecordId,
    jobDescriptionId,
    now,
    organizationId,
    schedule,
  }) => {
    await db.transaction(async (tx) => {
      await tx
        .update(studioInterview)
        .set({ interviewQuestions, pipelineStage: "ai_interview", updatedAt: now })
        .where(
          and(
            eq(studioInterview.id, interviewRecordId),
            eq(studioInterview.organizationId, organizationId),
          ),
        );
      await tx.insert(studioInterviewSchedule).values(schedule);
      // questionCount is the agent-dispatch required count; filled after snapshot
      // from bound templates. personalizedQuestionCount is resume-generated only.
      await tx.insert(interviewAuditLog).values({
        action: "ai_interview_launched",
        createdAt: now,
        detail: {
          personalizedQuestionCount: interviewQuestions.length,
          questionCount: 0,
          roundId: schedule.id,
          roundLabel: schedule.roundLabel,
        },
        id: auditLogId,
        interviewRecordId,
        operatorId: actorId,
        organizationId,
        scheduleEntryId: schedule.id,
      });
      await autoBindApplicableTemplates(tx, interviewRecordId, jobDescriptionId);
    });
  },
  createSnapshot: async ({ actorId, interviewRecordId, scheduleEntryId }) => {
    const snapshot = await loadOrCreateActiveInterviewContextSnapshot({
      createdBy: actorId,
      interviewRecordId,
      reason: "create",
      scheduleEntryId,
    });
    const requiredQuestionCount = flattenPresetQuestionsFromContextSnapshot(
      snapshot.payload,
    ).length;
    const [existing] = await db
      .select({
        detail: interviewAuditLog.detail,
        id: interviewAuditLog.id,
      })
      .from(interviewAuditLog)
      .where(
        and(
          eq(interviewAuditLog.interviewRecordId, interviewRecordId),
          eq(interviewAuditLog.scheduleEntryId, scheduleEntryId),
          eq(interviewAuditLog.action, "ai_interview_launched"),
        ),
      )
      .limit(1);
    if (!existing) {
      return;
    }
    await db
      .update(interviewAuditLog)
      .set({
        detail: {
          ...existing.detail,
          questionCount: requiredQuestionCount,
        },
      })
      .where(eq(interviewAuditLog.id, existing.id));
  },
  idGenerator: { next: () => crypto.randomUUID() },
  invalidateCache: invalidateStudioInterviewCaches,
  loadCandidate: ({ interviewRecordId, organizationId, visibilityScope }) =>
    loadResumeDetail(interviewRecordId, organizationId, visibilityScope),
});
