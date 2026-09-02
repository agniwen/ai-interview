import { and, asc, inArray, sql } from "drizzle-orm";
import { uniq } from "lodash-es";
import type { ResumeStageProgress } from "@app/shared/studio-resumes";
import { db } from "../../../../../../lib/server/db/index";
import {
  interviewConversation,
  studioHumanInterviewRound,
  studioInterviewSchedule,
  studioOfferDraft,
} from "@app/db-schema/schema";

// 兜底默认值：候选人完全没有任何子表数据时返回（虽然聚合 SQL 总会返回一个对象，
// 但 row.stageProgress 可能是 null —— 兜一手让下游永远拿到完整 shape）。
// Default fallback when the aggregation row returns null altogether.
export const EMPTY_STAGE_PROGRESS: ResumeStageProgress = {
  aiInterview: null,
  humanInterview: null,
  offer: null,
};

export interface ResumeStageProgressBundle {
  lastInterviewAt: string | null;
  stageProgress: ResumeStageProgress;
}

function serializeStageProgressTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

// 批量组装 AI/真人/Offer 阶段进度 + 最近面试时间，集中在一个函数里避免在分页行上重复
// correlated subquery。不依赖重试模块，供招聘台 DAO 与查重服务共同使用（避免循环依赖）。
// Batch-assembles stage progress + last interview time in one place to avoid
// per-row correlated subqueries. Cycle-free: no retry-eligibility dependency.
// oxlint-disable-next-line complexity
export async function loadResumeStageProgress(
  candidateIds: string[],
): Promise<Map<string, ResumeStageProgressBundle>> {
  const ids = uniq(candidateIds.filter(Boolean));
  const result = new Map<string, ResumeStageProgressBundle>();
  for (const id of ids) {
    result.set(id, {
      lastInterviewAt: null,
      stageProgress: { ...EMPTY_STAGE_PROGRESS },
    });
  }
  if (ids.length === 0) {
    return result;
  }

  const [aiRows, humanRows, offerRows, lastInterviewRows] = await Promise.all([
    db
      .select({
        interviewRecordId: studioInterviewSchedule.interviewRecordId,
        roundLabel: studioInterviewSchedule.roundLabel,
        sortOrder: studioInterviewSchedule.sortOrder,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .where(inArray(studioInterviewSchedule.interviewRecordId, ids))
      .orderBy(
        asc(studioInterviewSchedule.interviewRecordId),
        asc(studioInterviewSchedule.sortOrder),
      ),
    db
      .select({
        feedback: studioHumanInterviewRound.feedback,
        id: studioHumanInterviewRound.id,
        interviewRecordId: studioHumanInterviewRound.interviewRecordId,
        label: studioHumanInterviewRound.label,
        outcome: studioHumanInterviewRound.outcome,
        scheduledAt: studioHumanInterviewRound.scheduledAt,
        sortOrder: studioHumanInterviewRound.sortOrder,
        status: studioHumanInterviewRound.status,
      })
      .from(studioHumanInterviewRound)
      .where(inArray(studioHumanInterviewRound.interviewRecordId, ids))
      .orderBy(
        asc(studioHumanInterviewRound.interviewRecordId),
        asc(studioHumanInterviewRound.sortOrder),
      ),
    db
      .select({
        id: studioOfferDraft.id,
        interviewRecordId: studioOfferDraft.interviewRecordId,
        responseAt: studioOfferDraft.responseAt,
        sentAt: studioOfferDraft.sentAt,
        status: studioOfferDraft.status,
        version: studioOfferDraft.version,
      })
      .from(studioOfferDraft)
      .where(inArray(studioOfferDraft.interviewRecordId, ids))
      .orderBy(asc(studioOfferDraft.interviewRecordId), asc(studioOfferDraft.version)),
    db
      .select({
        interviewRecordId: interviewConversation.interviewRecordId,
        lastInterviewAt:
          sql<Date | null>`MAX(COALESCE(${interviewConversation.startedAt}, ${interviewConversation.createdAt}))`.as(
            "last_interview_at",
          ),
      })
      .from(interviewConversation)
      .where(
        and(
          inArray(interviewConversation.interviewRecordId, ids),
          inArray(interviewConversation.status, ["completed", "done"]),
        ),
      )
      .groupBy(interviewConversation.interviewRecordId),
  ]);

  const aiByCandidate = new Map<string, (typeof aiRows)[number][]>();
  for (const row of aiRows) {
    const current = aiByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    aiByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of aiByCandidate) {
    const derived = result.get(id);
    if (!derived || rows.length === 0) {
      continue;
    }
    const activeRound = rows.find((row) => row.status !== "completed") ?? null;
    derived.stageProgress.aiInterview = {
      activeRound: activeRound
        ? {
            roundLabel: activeRound.roundLabel,
            sortOrder: activeRound.sortOrder,
            status: activeRound.status,
          }
        : null,
      completedRounds: rows.filter((row) => row.status === "completed").length,
      hasStarted: rows.some((row) => row.status !== "pending"),
      totalRounds: rows.length,
    };
  }

  const humanByCandidate = new Map<string, (typeof humanRows)[number][]>();
  for (const row of humanRows) {
    const current = humanByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    humanByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of humanByCandidate) {
    const derived = result.get(id);
    const countedRows = rows.filter((row) => row.status !== "cancelled");
    if (!derived || countedRows.length === 0) {
      continue;
    }
    const activeRound = rows.find((row) => row.status === "pending") ?? null;
    derived.stageProgress.humanInterview = {
      activeRound: activeRound
        ? {
            id: activeRound.id,
            label: activeRound.label,
            outcome: activeRound.outcome,
            scheduledAt: serializeStageProgressTimestamp(activeRound.scheduledAt),
            sortOrder: activeRound.sortOrder,
            status: activeRound.status,
          }
        : null,
      completedRounds: countedRows.filter((row) => row.status === "completed").length,
      completedRoundsMissingFeedback: countedRows.filter(
        (row) => row.status === "completed" && !row.feedback?.trim(),
      ).length,
      failedRounds: countedRows.filter(
        (row) => row.status === "completed" && row.outcome === "fail",
      ).length,
      passedRounds: countedRows.filter(
        (row) => row.status === "completed" && row.outcome === "pass",
      ).length,
      totalRounds: countedRows.length,
    };
  }

  const offersByCandidate = new Map<string, (typeof offerRows)[number][]>();
  for (const row of offerRows) {
    if (row.status === "superseded") {
      continue;
    }
    const current = offersByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    offersByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of offersByCandidate) {
    const derived = result.get(id);
    if (!derived || rows.length === 0) {
      continue;
    }
    const latestDraft = rows.toSorted((a, b) => b.version - a.version)[0] ?? null;
    derived.stageProgress.offer = {
      latestDraft: latestDraft
        ? {
            id: latestDraft.id,
            responseAt: serializeStageProgressTimestamp(latestDraft.responseAt),
            sentAt: serializeStageProgressTimestamp(latestDraft.sentAt),
            status: latestDraft.status,
            version: latestDraft.version,
          }
        : null,
      totalVersions: rows.length,
    };
  }

  for (const row of lastInterviewRows) {
    if (!row.interviewRecordId) {
      continue;
    }
    const derived = result.get(row.interviewRecordId);
    if (derived) {
      derived.lastInterviewAt = serializeStageProgressTimestamp(row.lastInterviewAt);
    }
  }

  return result;
}
