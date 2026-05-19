// Round-keyed DAO for AI 面试 列表与详情。
// 主查询：FROM studio_interview_schedule LEFT JOIN studio_interview
// LEFT JOIN job_description LEFT JOIN user LEFT JOIN (conversations 是否存在) AS hasReport。
//
// Round-keyed DAO. Drives off studio_interview_schedule and joins back to
// the candidate row, JD, creator, and a "has at least one conversation" flag.

import { and, asc, count, desc, eq, exists, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  interviewConversation,
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import { buildInterviewLink } from "@/lib/shared/interview/interview-record";
import { scheduleEntryStatusSchema } from "@arc/db-schema/studio-interviews";
import type { ScheduleEntryStatus } from "@arc/db-schema/studio-interviews";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";
import { loadStudioCandidate } from "./studio-interviews";

const SORT_COLUMNS = ["scheduledAt", "createdAt", "candidateName", "roundLabel"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const roundsPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function parsePagination(params?: Record<string, unknown>) {
  return roundsPaginationSchema.parse(params ?? {});
}

function csvToList(value?: string | null): string[] | undefined {
  if (!value) {
    return;
  }
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseStatusFilter(value?: string | null): ScheduleEntryStatus[] | undefined {
  const items = csvToList(value);
  if (!items) {
    return;
  }
  const valid = items.filter((v): v is ScheduleEntryStatus =>
    scheduleEntryStatusSchema.options.includes(v as ScheduleEntryStatus),
  );
  return valid.length > 0 ? valid : undefined;
}

function serializeDate(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    candidateName: studioInterview.candidateName,
    createdAt: studioInterviewSchedule.createdAt,
    roundLabel: studioInterviewSchedule.roundLabel,
    scheduledAt: studioInterviewSchedule.scheduledAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function buildWhere(
  organizationId: string,
  filters?: { search?: string; statuses?: ScheduleEntryStatus[] },
) {
  const conditions: ReturnType<typeof eq | typeof or | typeof inArray>[] = [
    eq(studioInterviewSchedule.organizationId, organizationId),
  ];
  if (filters?.search) {
    const term = `%${filters.search}%`;
    const searchOr = or(
      ilike(studioInterview.candidateName, term),
      ilike(studioInterview.candidateEmail, term),
      ilike(studioInterview.targetRole, term),
      ilike(studioInterview.resumeFileName, term),
      ilike(studioInterviewSchedule.roundLabel, term),
    );
    if (searchOr) {
      conditions.push(searchOr);
    }
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(studioInterviewSchedule.status, filters.statuses));
  }
  return and(...conditions);
}

export async function queryPaginatedInterviewRounds(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedStudioInterviewRoundsResult> {
  const search = filters?.search?.trim() || undefined;
  const statuses = parseStatusFilter(filters?.status);
  const { page, pageSize, sortBy, sortOrder } = parsePagination(pagination);
  const offset = (page - 1) * pageSize;
  const where = buildWhere(organizationId, { search, statuses });

  // 子查询：当前 round 是否存在任意一条对应的 conversation 行。
  // Subquery: does at least one conversation row exist for this round.
  const hasReportSql = exists(
    db
      .select({ one: interviewConversation.conversationId })
      .from(interviewConversation)
      .where(eq(interviewConversation.scheduleEntryId, studioInterviewSchedule.id)),
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        allowTextInput: studioInterviewSchedule.allowTextInput,
        candidateEmail: studioInterview.candidateEmail,
        candidateId: studioInterview.id,
        candidateName: studioInterview.candidateName,
        candidatePhone: studioInterview.candidatePhone,
        conversationId: studioInterviewSchedule.conversationId,
        createdAt: studioInterviewSchedule.createdAt,
        createdBy: studioInterview.createdBy,
        creatorImage: user.image,
        creatorName: user.name,
        creatorOrganizationName: user.feishuTenantName,
        hasReport: hasReportSql,
        id: studioInterviewSchedule.id,
        jobDescriptionId: studioInterview.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
        roundLabel: studioInterviewSchedule.roundLabel,
        scheduledAt: studioInterviewSchedule.scheduledAt,
        sortOrder: studioInterviewSchedule.sortOrder,
        status: studioInterviewSchedule.status,
        targetRole: studioInterview.targetRole,
        updatedAt: studioInterviewSchedule.updatedAt,
      })
      .from(studioInterviewSchedule)
      .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
      .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
      .leftJoin(user, eq(studioInterview.createdBy, user.id))
      .where(where)
      .orderBy(buildOrderBy(sortBy, sortOrder))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(studioInterviewSchedule)
      .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
      .where(where),
  ]);

  const total = totalRow?.count ?? 0;
  const records: StudioInterviewRoundListRecord[] = rows.map((row) => ({
    allowTextInput: row.allowTextInput,
    candidateEmail: row.candidateEmail,
    candidateId: row.candidateId ?? "",
    candidateName: row.candidateName ?? "",
    candidatePhone: row.candidatePhone,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasReport: Boolean(row.hasReport),
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId ?? "", row.id),
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    resumeFileName: row.resumeFileName,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    sortOrder: row.sortOrder,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  }));

  return {
    page,
    pageSize,
    records,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Cached version for Server Components */
export function listInterviewRounds(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
) {
  return queryPaginatedInterviewRounds(organizationId, filters, pagination);
}

/**
 * 按候选人取所有面试轮次（按 sortOrder 升序）。
 * 用于简历库详情弹窗里的「AI 面试」tab。
 *
 * List all rounds for a given candidate, sorted by sortOrder asc. Used by the
 * resume library detail dialog's "AI 面试" tab.
 */
export async function listInterviewRoundsForCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  const hasReportSql = exists(
    db
      .select({ one: interviewConversation.conversationId })
      .from(interviewConversation)
      .where(eq(interviewConversation.scheduleEntryId, studioInterviewSchedule.id)),
  );

  const rows = await db
    .select({
      allowTextInput: studioInterviewSchedule.allowTextInput,
      candidateEmail: studioInterview.candidateEmail,
      candidateId: studioInterview.id,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      conversationId: studioInterviewSchedule.conversationId,
      createdAt: studioInterviewSchedule.createdAt,
      createdBy: studioInterview.createdBy,
      creatorImage: user.image,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      hasReport: hasReportSql,
      id: studioInterviewSchedule.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      resumeFileName: studioInterview.resumeFileName,
      resumeStorageKey: studioInterview.resumeStorageKey,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      sortOrder: studioInterviewSchedule.sortOrder,
      status: studioInterviewSchedule.status,
      targetRole: studioInterview.targetRole,
      updatedAt: studioInterviewSchedule.updatedAt,
    })
    .from(studioInterviewSchedule)
    .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .where(
      and(
        eq(studioInterviewSchedule.interviewRecordId, candidateId),
        eq(studioInterviewSchedule.organizationId, organizationId),
      ),
    )
    .orderBy(asc(studioInterviewSchedule.sortOrder));

  return rows.map((row) => ({
    allowTextInput: row.allowTextInput,
    candidateEmail: row.candidateEmail,
    candidateId: row.candidateId ?? candidateId,
    candidateName: row.candidateName ?? "",
    candidatePhone: row.candidatePhone,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasReport: Boolean(row.hasReport),
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId ?? candidateId, row.id),
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    resumeFileName: row.resumeFileName,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    sortOrder: row.sortOrder,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  }));
}

export async function loadInterviewRoundDetail(
  roundId: string,
  organizationId: string,
): Promise<StudioInterviewRoundDetail | null> {
  const [row] = await db
    .select({
      allowTextInput: studioInterviewSchedule.allowTextInput,
      candidateId: studioInterviewSchedule.interviewRecordId,
      conversationId: studioInterviewSchedule.conversationId,
      createdAt: studioInterviewSchedule.createdAt,
      disconnectedAt: studioInterviewSchedule.disconnectedAt,
      id: studioInterviewSchedule.id,
      notes: studioInterviewSchedule.notes,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      sessionStartedAt: studioInterviewSchedule.sessionStartedAt,
      sortOrder: studioInterviewSchedule.sortOrder,
      status: studioInterviewSchedule.status,
      updatedAt: studioInterviewSchedule.updatedAt,
    })
    .from(studioInterviewSchedule)
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const candidate = await loadStudioCandidate(row.candidateId, organizationId);
  if (!candidate) {
    return null;
  }

  const [reportRow] = await db
    .select({ id: interviewConversation.conversationId })
    .from(interviewConversation)
    .where(eq(interviewConversation.scheduleEntryId, row.id))
    .limit(1);

  return {
    allowTextInput: row.allowTextInput,
    candidate,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    disconnectedAt: serializeDate(row.disconnectedAt),
    hasReport: Boolean(reportRow),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId, row.id),
    notes: row.notes,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    sessionStartedAt: serializeDate(row.sessionStartedAt),
    sortOrder: row.sortOrder,
    status: row.status,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  };
}

export interface InterviewRoundSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

export async function summarizeInterviewRoundCounts(
  organizationId: string,
): Promise<InterviewRoundSummary> {
  const rows = await db
    .select({ count: count(), status: studioInterviewSchedule.status })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.organizationId, organizationId))
    .groupBy(studioInterviewSchedule.status);

  let total = 0;
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let interrupted = 0;
  for (const row of rows) {
    total += row.count;
    if (row.status === "pending") {
      pending = row.count;
    } else if (row.status === "in_progress") {
      inProgress = row.count;
    } else if (row.status === "completed") {
      completed = row.count;
    } else if (row.status === "interrupted") {
      interrupted = row.count;
    }
  }
  return { completed, inProgress, interrupted, pending, total };
}

/** Resolve candidateId from roundId; null if not found. */
export async function resolveCandidateIdForRound(
  roundId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ candidateId: studioInterviewSchedule.interviewRecordId })
    .from(studioInterviewSchedule)
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row?.candidateId ?? null;
}
