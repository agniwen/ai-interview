import type { InterviewerListRecord, InterviewerRecord } from "@/lib/interviewers";
import type { MinimaxVoiceId } from "@/lib/minimax-voices";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { department, interviewer, jobDescriptionInterviewer } from "@/lib/db/schema";

const interviewerListFiltersSchema = z.object({
  departmentId: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const interviewerPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type InterviewerPaginationParams = z.infer<typeof interviewerPaginationSchema>;

export interface PaginatedInterviewerResult {
  records: InterviewerListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({
  search,
  departmentId,
}: {
  search?: string;
  departmentId?: string;
}) {
  const conditions = [] as (ReturnType<typeof ilike> | ReturnType<typeof eq>)[];
  if (search) {
    const searchCond = or(
      ilike(interviewer.name, `%${search}%`),
      ilike(interviewer.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (departmentId) {
    conditions.push(eq(interviewer.departmentId, departmentId));
  }
  if (conditions.length === 0) {
    return;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions);
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: interviewer.createdAt,
    name: interviewer.name,
    updatedAt: interviewer.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function listInterviewerRows({
  search,
  departmentId,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  departmentId?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ departmentId, search });

  let query = db
    .select({
      createdAt: interviewer.createdAt,
      createdBy: interviewer.createdBy,
      departmentId: interviewer.departmentId,
      departmentName: department.name,
      description: interviewer.description,
      id: interviewer.id,
      name: interviewer.name,
      prompt: interviewer.prompt,
      updatedAt: interviewer.updatedAt,
      voice: interviewer.voice,
    })
    .from(interviewer)
    .leftJoin(department, eq(interviewer.departmentId, department.id))
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

async function countInterviewerRows({
  search,
  departmentId,
}: {
  search?: string;
  departmentId?: string;
}) {
  const where = buildWhereConditions({ departmentId, search });
  const [result] = await db.select({ count: count() }).from(interviewer).where(where);
  return result?.count ?? 0;
}

async function loadJobDescriptionCounts(interviewerIds: string[]) {
  if (interviewerIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      count: count(),
      interviewerId: jobDescriptionInterviewer.interviewerId,
    })
    .from(jobDescriptionInterviewer)
    .where(inArray(jobDescriptionInterviewer.interviewerId, interviewerIds))
    .groupBy(jobDescriptionInterviewer.interviewerId);

  const map = new Map<string, number>();
  for (const id of interviewerIds) {
    map.set(id, 0);
  }
  for (const row of rows) {
    map.set(row.interviewerId, row.count);
  }
  return map;
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toInterviewerListRecord(
  row: Awaited<ReturnType<typeof listInterviewerRows>>[number],
  jobDescriptionCount: number,
): InterviewerListRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    description: row.description,
    id: row.id,
    jobDescriptionCount,
    name: row.name,
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
    voice: row.voice,
  };
}

function parseFilters(filters?: { search?: string | null; departmentId?: string | null }) {
  const parsed = interviewerListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { departmentId: undefined, search: undefined };
  }
  return {
    departmentId: parsed.data.departmentId?.trim() || undefined,
    search: parsed.data.search?.trim() || undefined,
  };
}

export function parseInterviewerPagination(
  params?: Record<string, unknown>,
): InterviewerPaginationParams {
  return interviewerPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedInterviewers(
  filters?: { search?: string | null; departmentId?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedInterviewerResult> {
  const { search, departmentId } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseInterviewerPagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listInterviewerRows({ departmentId, limit: pageSize, offset, search, sortBy, sortOrder }),
    countInterviewerRows({ departmentId, search }),
  ]);

  const countsMap = await loadJobDescriptionCounts(records.map((record) => record.id));

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toInterviewerListRecord(record, countsMap.get(record.id) ?? 0),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewers(
  filters?: { search?: string | null; departmentId?: string | null },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("interviewers");
  cacheLife("minutes");

  return queryPaginatedInterviewers(filters, pagination);
}

// oxlint-disable-next-line require-await
export async function listAllInterviewers(): Promise<InterviewerListRecord[]> {
  "use cache";
  cacheTag("interviewers");
  cacheLife("minutes");

  const rows = await db
    .select({
      createdAt: interviewer.createdAt,
      createdBy: interviewer.createdBy,
      departmentId: interviewer.departmentId,
      departmentName: department.name,
      description: interviewer.description,
      id: interviewer.id,
      name: interviewer.name,
      prompt: interviewer.prompt,
      updatedAt: interviewer.updatedAt,
      voice: interviewer.voice,
    })
    .from(interviewer)
    .leftJoin(department, eq(interviewer.departmentId, department.id))
    .orderBy(asc(interviewer.name));

  return rows.map((row) => ({
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    description: row.description,
    id: row.id,
    jobDescriptionCount: 0,
    name: row.name,
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
    voice: row.voice,
  }));
}

export async function loadInterviewerReferenceCounts(id: string) {
  const [result] = await db
    .select({ count: count() })
    .from(jobDescriptionInterviewer)
    .where(eq(jobDescriptionInterviewer.interviewerId, id));

  return {
    jobDescriptionCount: result?.count ?? 0,
  };
}

export async function loadInterviewerById(id: string): Promise<InterviewerRecord | null> {
  const [row] = await db.select().from(interviewer).where(eq(interviewer.id, id)).limit(1);
  if (!row) {
    return null;
  }
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
    voice: row.voice as MinimaxVoiceId,
  };
}

export function serializeInterviewer(row: typeof interviewer.$inferSelect): InterviewerRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
    voice: row.voice as MinimaxVoiceId,
  };
}
