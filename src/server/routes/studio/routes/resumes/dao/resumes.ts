import "server-only";

import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { jobDescription, studioInterview, user } from "@/lib/shared/db/schema";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
  ResumeLibraryListRecord,
} from "@/lib/shared/studio-resumes";

const SORT_COLUMNS = ["createdAt", "candidateName", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const filtersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
});

type Pagination = z.infer<typeof paginationSchema>;
type Filters = z.infer<typeof filtersSchema>;

function buildWhere(organizationId: string, filters?: Filters) {
  const search = filters?.search?.trim();
  if (!search) {
    return eq(studioInterview.organizationId, organizationId);
  }
  const like = `%${search}%`;
  return and(
    eq(studioInterview.organizationId, organizationId),
    or(
      ilike(studioInterview.candidateName, like),
      ilike(studioInterview.candidateEmail, like),
      ilike(studioInterview.candidatePhone, like),
      ilike(studioInterview.resumeFileName, like),
      ilike(studioInterview.targetRole, like),
    ),
  );
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const map = {
    candidateName: studioInterview.candidateName,
    createdAt: studioInterview.createdAt,
    updatedAt: studioInterview.updatedAt,
  } as const;
  return sortOrder === "asc" ? asc(map[sortBy]) : desc(map[sortBy]);
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
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
    .orderBy(buildOrderBy(sortBy, sortOrder))
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
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
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
  filters?: { search?: string | null },
  pagination?: Partial<Pagination>,
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
    totalPages: Math.max(1, Math.ceil(total / parsedPagination.pageSize)),
  };
}

/** Cached version for Server Components.
 * 供 Server Component 使用的缓存版本，自动标记 "studio-resumes" cache tag。
 */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listResumeRecords(
  organizationId: string,
  filters?: { search?: string | null },
  pagination?: Partial<Pagination>,
) {
  "use cache";
  cacheTag("studio-resumes");
  cacheLife("minutes");
  return queryPaginatedResumeRecords(organizationId, filters, pagination);
}

export async function loadResumeDetail(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
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

  const { resumeProfile, ...rest } = row;
  return {
    ...toRecord(rest),
    resumeProfile,
  };
}
