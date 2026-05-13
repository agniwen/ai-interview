import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { StudioCandidateRecord } from "@/lib/shared/studio-candidates";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@/lib/shared/db/schema";
import { buildInterviewLink, sortScheduleEntries } from "@/lib/shared/interview/interview-record";
import { studioInterviewStatusValues } from "@/lib/shared/studio-interviews";
import type {
  StudioInterviewListRecord,
  StudioInterviewStatus,
  studioInterviewStatusSchema,
} from "@/lib/shared/studio-interviews";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// 多选过滤器走 CSV / Multi-select filters: CSV serialization in URL/state.
const studioInterviewListFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
  status: z.string().trim().max(200).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "candidateName", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const studioInterviewPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type StudioInterviewPaginationParams = z.infer<typeof studioInterviewPaginationSchema>;

export interface PaginatedStudioInterviewResult {
  records: StudioInterviewListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type StudioInterviewListRow = Awaited<ReturnType<typeof listStudioInterviewRows>>[number];
type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

function loadScheduleEntries(interviewIds: string[]): Promise<StudioInterviewScheduleRow[]> {
  if (interviewIds.length === 0) {
    return Promise.resolve([]);
  }

  return db
    .select()
    .from(studioInterviewSchedule)
    .where(inArray(studioInterviewSchedule.interviewRecordId, interviewIds));
}

async function findMatchingScheduleRecordIds(search: string) {
  const rows = await db
    .selectDistinct({ interviewRecordId: studioInterviewSchedule.interviewRecordId })
    .from(studioInterviewSchedule)
    .where(ilike(studioInterviewSchedule.roundLabel, `%${search}%`));

  return rows.map((row) => row.interviewRecordId);
}

function buildWhereConditions({
  search,
  statuses,
  matchingScheduleRecordIds,
}: {
  search?: string;
  statuses?: z.infer<typeof studioInterviewStatusSchema>[];
  matchingScheduleRecordIds: string[];
}) {
  const searchConditions = search
    ? [
        ilike(studioInterview.candidateName, `%${search}%`),
        ilike(studioInterview.candidateEmail, `%${search}%`),
        ilike(studioInterview.resumeFileName, `%${search}%`),
        ilike(studioInterview.targetRole, `%${search}%`),
        ...(matchingScheduleRecordIds.length > 0
          ? [inArray(studioInterview.id, matchingScheduleRecordIds)]
          : []),
      ]
    : [];
  const whereConditions = [
    searchConditions.length > 0 ? or(...searchConditions) : undefined,
    statuses && statuses.length > 0 ? inArray(studioInterview.status, statuses) : undefined,
  ].filter(Boolean);

  return whereConditions.length > 0 ? and(...whereConditions) : undefined;
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    candidateName: studioInterview.candidateName,
    createdAt: studioInterview.createdAt,
    updatedAt: studioInterview.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

const SELECTED_COLUMNS = {
  candidateEmail: studioInterview.candidateEmail,
  candidateName: studioInterview.candidateName,
  candidatePhone: studioInterview.candidatePhone,
  createdAt: studioInterview.createdAt,
  createdBy: studioInterview.createdBy,
  creatorName: user.name,
  creatorOrganizationName: user.feishuTenantName,
  id: studioInterview.id,
  interviewQuestions: studioInterview.interviewQuestions,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  notes: studioInterview.notes,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeFileName: studioInterview.resumeFileName,
  resumeStorageKey: studioInterview.resumeStorageKey,
  status: studioInterview.status,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterview.updatedAt,
} as const;

async function listStudioInterviewRows({
  organizationId,
  search,
  statuses,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  search?: string;
  statuses?: z.infer<typeof studioInterviewStatusSchema>[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const matchingScheduleRecordIds = search ? await findMatchingScheduleRecordIds(search) : [];
  const filterWhere = buildWhereConditions({ matchingScheduleRecordIds, search, statuses });
  const where = and(eq(studioInterview.organizationId, organizationId), filterWhere);

  let query = db
    .select(SELECTED_COLUMNS)
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(where)
    .orderBy(buildOrderBy(sortBy, sortOrder))
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

async function countStudioInterviewRows({
  organizationId,
  search,
  statuses,
}: {
  organizationId: string;
  search?: string;
  statuses?: z.infer<typeof studioInterviewStatusSchema>[];
}) {
  const matchingScheduleRecordIds = search ? await findMatchingScheduleRecordIds(search) : [];
  const filterWhere = buildWhereConditions({ matchingScheduleRecordIds, search, statuses });
  const where = and(eq(studioInterview.organizationId, organizationId), filterWhere);

  const [result] = await db.select({ count: count() }).from(studioInterview).where(where);
  return result?.count ?? 0;
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// 把 schedule entries 按 interviewRecordId 分桶，避免 N×M 内存过滤。
// Bucket schedule entries by interviewRecordId so the per-record transform is O(1)
// instead of filtering the full list for every record.
function groupScheduleEntries(
  entries: StudioInterviewScheduleRow[],
): Map<string, StudioInterviewScheduleRow[]> {
  const map = new Map<string, StudioInterviewScheduleRow[]>();
  for (const entry of entries) {
    const bucket = map.get(entry.interviewRecordId);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(entry.interviewRecordId, [entry]);
    }
  }
  return map;
}

function toStudioInterviewListRecord(
  record: StudioInterviewListRow,
  scheduleEntries: StudioInterviewScheduleRow[],
): StudioInterviewListRecord {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone,
    createdAt: serializeDate(record.createdAt),
    createdBy: record.createdBy,
    creatorName: record.creatorName,
    creatorOrganizationName: record.creatorOrganizationName,
    hasResumeFile: Boolean(record.resumeStorageKey),
    id: record.id,
    interviewLink: buildInterviewLink(record.id),
    jobDescriptionId: record.jobDescriptionId,
    jobDescriptionName: record.jobDescriptionName,
    notes: record.notes,
    questionCount: record.interviewQuestions?.length ?? 0,
    resumeContentHash: record.resumeContentHash,
    resumeFileName: record.resumeFileName,
    scheduleEntries: sortScheduleEntries(
      scheduleEntries.map((entry) => ({
        ...entry,
        createdAt: serializeDate(entry.createdAt),
        scheduledAt: entry.scheduledAt ? serializeDate(entry.scheduledAt) : null,
        updatedAt: serializeDate(entry.updatedAt),
      })),
    ),
    status: record.status,
    targetRole: record.targetRole,
    updatedAt: serializeDate(record.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function csvToIds(value?: string | null): string[] | undefined {
  if (!value) {
    return;
  }
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function parseStatuses(value?: string | null): StudioInterviewStatus[] | undefined {
  const ids = csvToIds(value);
  if (!ids) {
    return;
  }
  const valid = ids.filter((id): id is StudioInterviewStatus =>
    (studioInterviewStatusValues as readonly string[]).includes(id),
  );
  return valid.length > 0 ? valid : undefined;
}

function parseFilters(filters?: { search?: string | null; status?: string | null }) {
  const parsed = studioInterviewListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { search: undefined, statuses: undefined };
  }

  return {
    search: parsed.data.search?.trim() || undefined,
    statuses: parseStatuses(parsed.data.status),
  };
}

export function parsePagination(params?: Record<string, unknown>): StudioInterviewPaginationParams {
  return studioInterviewPaginationSchema.parse(params ?? {});
}

async function queryStudioInterviewRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    status?: string | null;
  },
) {
  const { search, statuses } = parseFilters(filters);
  const records = await listStudioInterviewRows({ organizationId, search, statuses });
  const scheduleEntries = await loadScheduleEntries(records.map((record) => record.id));
  const entriesByRecordId = groupScheduleEntries(scheduleEntries);

  return records.map((record) =>
    toStudioInterviewListRecord(record, entriesByRecordId.get(record.id) ?? []),
  );
}

async function queryPaginatedStudioInterviewRecords(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedStudioInterviewResult> {
  const { search, statuses } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parsePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listStudioInterviewRows({
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
      statuses,
    }),
    countStudioInterviewRows({ organizationId, search, statuses }),
  ]);

  const scheduleEntries = await loadScheduleEntries(records.map((record) => record.id));
  const entriesByRecordId = groupScheduleEntries(scheduleEntries);

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toStudioInterviewListRecord(record, entriesByRecordId.get(record.id) ?? []),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface StudioInterviewSummary {
  total: number;
  ready: number;
  completed: number;
  rounds: number;
}

async function queryStudioInterviewSummary(
  organizationId: string,
): Promise<StudioInterviewSummary> {
  const [statusRows, [roundsRow]] = await Promise.all([
    db
      .select({ count: count(), status: studioInterview.status })
      .from(studioInterview)
      .where(eq(studioInterview.organizationId, organizationId))
      .groupBy(studioInterview.status),
    db
      .select({ count: count() })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.organizationId, organizationId)),
  ]);

  let total = 0;
  let ready = 0;
  let completed = 0;
  for (const row of statusRows) {
    total += row.count;
    if (row.status === "ready") {
      ready = row.count;
    } else if (row.status === "completed") {
      completed = row.count;
    }
  }

  return {
    completed,
    ready,
    rounds: roundsRow?.count ?? 0,
    total,
  };
}

/** Cached version for Server Components */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listStudioInterviewRecords(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("studio-interviews");
  cacheLife("minutes");

  return queryPaginatedStudioInterviewRecords(organizationId, filters, pagination);
}

// ---------------------------------------------------------------------------
// 身份维度查重：按姓名/邮箱/电话 OR 命中。
// Identity-based dedup: matches by name OR email OR phone (any one suffices).
// 与文件哈希查重互补——前者抓"同一份 PDF"，这里抓"同一个人"。
// Complements the file-hash dedup (same PDF) by surfacing same-candidate cases.
// ---------------------------------------------------------------------------

export type DedupMatchedField = "name" | "email" | "phone";

export interface DedupMatchRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  status: StudioInterviewStatus;
  createdAt: string;
  matchedFields: DedupMatchedField[];
}

const DEDUP_LIMIT = 20;

function normalizeForDedup(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function queryInterviewDedup(
  organizationId: string,
  input: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<DedupMatchRecord[]> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  const phone = input.phone?.trim();
  // 简历 LLM 返回不可识别字段时填占位文本，不能用作查重输入。
  // The LLM returns the placeholder when a field is unrecognized; never match on it.
  const PLACEHOLDER = "未发现信息";
  const usableName = name && name !== PLACEHOLDER ? name : null;
  const usableEmail = email && email !== PLACEHOLDER ? email : null;
  const usablePhone = phone && phone !== PLACEHOLDER ? phone : null;

  if (!(usableName || usableEmail || usablePhone)) {
    return [];
  }

  const conditions = [
    usableName
      ? sql`lower(trim(${studioInterview.candidateName})) = lower(trim(${usableName}))`
      : null,
    usableEmail
      ? sql`lower(trim(${studioInterview.candidateEmail})) = lower(trim(${usableEmail}))`
      : null,
    usablePhone ? sql`trim(${studioInterview.candidatePhone}) = trim(${usablePhone})` : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);

  const rows = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      id: studioInterview.id,
      jobDescriptionName: jobDescription.name,
      status: studioInterview.status,
      targetRole: studioInterview.targetRole,
    })
    .from(studioInterview)
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.organizationId, organizationId), or(...conditions)))
    .orderBy(desc(studioInterview.createdAt))
    .limit(DEDUP_LIMIT);

  const nameKey = usableName ? normalizeForDedup(usableName) : "";
  const emailKey = usableEmail ? normalizeForDedup(usableEmail) : "";
  const phoneKey = usablePhone ? usablePhone.trim() : "";

  return rows.map((row) => {
    const matchedFields: DedupMatchedField[] = [];
    if (nameKey && normalizeForDedup(row.candidateName) === nameKey) {
      matchedFields.push("name");
    }
    if (emailKey && normalizeForDedup(row.candidateEmail) === emailKey) {
      matchedFields.push("email");
    }
    if (phoneKey && (row.candidatePhone?.trim() ?? "") === phoneKey) {
      matchedFields.push("phone");
    }
    return {
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      candidatePhone: row.candidatePhone,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      id: row.id,
      jobDescriptionName: row.jobDescriptionName,
      matchedFields,
      status: row.status,
      targetRole: row.targetRole,
    };
  });
}

/** Uncached version for API route handlers */
export {
  queryInterviewDedup,
  queryPaginatedStudioInterviewRecords,
  queryStudioInterviewRecords,
  queryStudioInterviewSummary,
};

/**
 * Load a candidate (studio_interview row) with JD + creator info, without
 * embedding scheduleEntries (those belong to the round-side view).
 * 加载候选人聚合记录（不含 scheduleEntries —— 那是 round 维度的事）。
 */
export async function loadStudioCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioCandidateRecord | null> {
  const [row] = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      createdBy: studioInterview.createdBy,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      id: studioInterview.id,
      interviewQuestions: studioInterview.interviewQuestions,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      resumeContentHash: studioInterview.resumeContentHash,
      resumeFileName: studioInterview.resumeFileName,
      resumeProfile: studioInterview.resumeProfile,
      resumeStorageKey: studioInterview.resumeStorageKey,
      status: studioInterview.status,
      targetRole: studioInterview.targetRole,
      updatedAt: studioInterview.updatedAt,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(
      and(eq(studioInterview.id, candidateId), eq(studioInterview.organizationId, organizationId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    createdBy: row.createdBy,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    id: row.id,
    interviewQuestions: row.interviewQuestions ?? [],
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    notes: row.notes,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeProfile: row.resumeProfile,
    resumeStorageKey: row.resumeStorageKey,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
