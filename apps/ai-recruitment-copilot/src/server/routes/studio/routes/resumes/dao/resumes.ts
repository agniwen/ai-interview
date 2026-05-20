import "server-only";

import { and, arrayContains, count, eq, exists, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { buildOrderBy, calcTotalPages, makePaginationSchema } from "@/lib/server/db/pagination";
import { serializeDate } from "@/lib/server/db/serialize";
import {
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
  ResumeLibraryListRecord,
} from "@/lib/shared/studio-resumes";
import { normalizeSkill } from "./skills";

const SORT_COLUMNS = ["createdAt", "candidateName", "updatedAt"] as const;

const ORDER_COLUMNS = {
  candidateName: studioInterview.candidateName,
  createdAt: studioInterview.createdAt,
  updatedAt: studioInterview.updatedAt,
} as const;

const paginationSchema = makePaginationSchema(SORT_COLUMNS);

// 允许调用方原样传入 CSV 拆分结果（可能含空串）；buildWhere 内统一 trim + drop blank。
// Accept caller-supplied arrays that may contain empty/whitespace entries —
// buildWhere drops blanks before using them so we don't need to error here.
const filtersSchema = z.object({
  jobDescriptionIds: z.array(z.string()).max(50).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  skills: z.array(z.string()).max(20).optional().nullable(),
});

type Pagination = z.infer<typeof paginationSchema>;
type Filters = z.infer<typeof filtersSchema>;

function buildWhere(organizationId: string, filters?: Filters) {
  const conditions = [eq(studioInterview.organizationId, organizationId)];

  const search = filters?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    const searchClause = or(
      ilike(studioInterview.candidateName, like),
      ilike(studioInterview.candidateEmail, like),
      ilike(studioInterview.candidatePhone, like),
      ilike(studioInterview.resumeFileName, like),
      ilike(studioInterview.targetRole, like),
    );
    if (searchClause) {
      conditions.push(searchClause);
    }
  }

  // 输入按存储归一化规则同样处理后再 dedupe；空字符串丢弃。
  // candidate 行上的 skills_normalized 列已经是 lowercase + 折叠空白，所以用户输入
  // 也要走同一套归一化函数。AND（交集）语义直接用 PG 的 `@>` 包含运算符——一句话搞定，
  // GIN 索引直接命中，无需 EXISTS / GROUP BY / HAVING 三层嵌套。
  //
  // Same normalization as the write path. AND (intersection) semantics are
  // expressed by PG's `@>` (contains-all) operator over the GIN-indexed
  // skills_normalized array — single index lookup, no EXISTS / GROUP BY /
  // HAVING gymnastics required.
  const skills = [
    ...new Set(
      (filters?.skills ?? []).map((s) => normalizeSkill(s).normalized).filter((s) => s.length > 0),
    ),
  ];
  if (skills.length > 0) {
    conditions.push(arrayContains(studioInterview.skillsNormalized, skills));
  }

  const jdIds = filters?.jobDescriptionIds?.filter((id) => id.trim().length > 0) ?? [];
  if (jdIds.length > 0) {
    conditions.push(inArray(studioInterview.jobDescriptionId, jdIds));
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

// 子查询：该候选人是否已有任意 AI 面试轮次。
// Subquery: whether this candidate already has any AI interview round.
const hasInterviewRoundsSql = exists(
  db
    .select({ one: studioInterviewSchedule.id })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
);

const SELECTED_COLUMNS = {
  candidateEmail: studioInterview.candidateEmail,
  candidateName: studioInterview.candidateName,
  candidatePhone: studioInterview.candidatePhone,
  createdAt: studioInterview.createdAt,
  createdBy: studioInterview.createdBy,
  creatorImage: user.image,
  creatorName: user.name,
  creatorOrganizationName: user.feishuTenantName,
  hasInterviewRounds: hasInterviewRoundsSql,
  id: studioInterview.id,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  notes: studioInterview.notes,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeFileName: studioInterview.resumeFileName,
  resumeStorageKey: studioInterview.resumeStorageKey,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterview.updatedAt,
} as const;

type Row = Awaited<ReturnType<typeof selectRows>>[number];

function selectRows({
  organizationId,
  filters,
  pagination,
}: {
  organizationId: string;
  filters?: Filters;
  pagination?: Partial<Pagination>;
}) {
  const { page, pageSize, sortBy, sortOrder } = paginationSchema.parse(pagination ?? {});
  const offset = (page - 1) * pageSize;

  return db
    .select(SELECTED_COLUMNS)
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(buildWhere(organizationId, filters))
    .orderBy(buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder))
    .limit(pageSize)
    .offset(offset);
}

function toRecord(row: Row): ResumeLibraryListRecord {
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasInterviewRounds: Boolean(row.hasInterviewRounds),
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    notes: row.notes,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function queryPaginatedResumeRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedResumeLibraryResult> {
  const parsedFilters = filtersSchema.parse(filters ?? {});
  const parsedPagination = paginationSchema.parse(pagination ?? {});
  const where = buildWhere(organizationId, parsedFilters);

  const [rows, [countRow]] = await Promise.all([
    selectRows({
      filters: parsedFilters,
      organizationId,
      pagination: parsedPagination,
    }),
    db.select({ count: count() }).from(studioInterview).where(where),
  ]);

  const total = countRow?.count ?? 0;
  return {
    page: parsedPagination.page,
    pageSize: parsedPagination.pageSize,
    records: rows.map(toRecord),
    total,
    totalPages: calcTotalPages(total, parsedPagination.pageSize),
  };
}

/** Cached version for Server Components.
 * 供 Server Component 使用的缓存版本，自动标记 "studio-resumes" cache tag。
 */
export function listResumeRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
  },
  pagination?: Partial<Pagination>,
) {
  return queryPaginatedResumeRecords(organizationId, filters, pagination);
}

export async function loadResumeDetail(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
      interviewQuestions: studioInterview.interviewQuestions,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { resumeProfile, interviewQuestions, ...rest } = row;
  return {
    ...toRecord(rest),
    interviewQuestions: interviewQuestions ?? [],
    resumeProfile,
  };
}
