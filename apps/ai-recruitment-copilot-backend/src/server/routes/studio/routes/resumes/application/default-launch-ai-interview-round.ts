import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { buildScheduleRows } from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { loadOrCreateActiveInterviewContextSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
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
      await tx.insert(interviewAuditLog).values({
        action: "ai_interview_launched",
        createdAt: now,
        detail: {
          questionCount: interviewQuestions.length,
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
    await loadOrCreateActiveInterviewContextSnapshot({
      createdBy: actorId,
      interviewRecordId,
      reason: "create",
      scheduleEntryId,
    });
  },
  idGenerator: { next: () => crypto.randomUUID() },
  invalidateCache: invalidateStudioInterviewCaches,
  loadCandidate: ({ interviewRecordId, organizationId, visibilityScope }) =>
    loadResumeDetail(interviewRecordId, organizationId, visibilityScope),
});
