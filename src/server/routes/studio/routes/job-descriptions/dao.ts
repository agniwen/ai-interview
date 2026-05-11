import type {
  JobDescriptionInterviewerSummary,
  JobDescriptionListRecord,
  JobDescriptionRecord,
} from "@/lib/shared/job-descriptions";
import type { MinimaxVoiceId } from "@/lib/shared/minimax-voices";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
} from "@/lib/shared/db/schema";

const jobDescriptionListFiltersSchema = z.object({
  departmentId: z.string().trim().max(120).optional().nullable(),
  interviewerId: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const jobDescriptionPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type JobDescriptionPaginationParams = z.infer<typeof jobDescriptionPaginationSchema>;

export interface PaginatedJobDescriptionResult {
  records: JobDescriptionListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
}: {
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
}) {
  const conditions = [] as (ReturnType<typeof ilike> | ReturnType<typeof eq>)[];
  if (search) {
    const searchCond = or(
      ilike(jobDescription.name, `%${search}%`),
      ilike(jobDescription.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (departmentIds && departmentIds.length > 0) {
    conditions.push(inArray(jobDescription.departmentId, departmentIds));
  }
  if (interviewerIds && interviewerIds.length > 0) {
    if (!jdIdsForInterviewers || jdIdsForInterviewers.length === 0) {
      // 选了面试官但没有任何关联 JD → 永远不命中 / short-circuit empty result.
      conditions.push(eq(jobDescription.id, "__never__"));
    } else {
      conditions.push(inArray(jobDescription.id, jdIdsForInterviewers));
    }
  }
  if (conditions.length === 0) {
    return;
  }
  return and(...conditions);
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: jobDescription.createdAt,
    name: jobDescription.name,
    updatedAt: jobDescription.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

async function resolveJdIdsForInterviewers(
  interviewerIds?: string[],
): Promise<string[] | undefined> {
  if (!interviewerIds || interviewerIds.length === 0) {
    return;
  }
  const rows = await db
    .select({ jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId })
    .from(jobDescriptionInterviewer)
    .where(inArray(jobDescriptionInterviewer.interviewerId, interviewerIds));
  // 任意一个面试官 → 该 JD 命中（OR 语义）/ Any matching interviewer surfaces the JD.
  return [...new Set(rows.map((row) => row.jobDescriptionId))];
}

function listJobDescriptionRows({
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({
    departmentIds,
    interviewerIds,
    jdIdsForInterviewers,
    search,
  });

  let query = db
    .select({
      createdAt: jobDescription.createdAt,
      createdBy: jobDescription.createdBy,
      departmentId: jobDescription.departmentId,
      departmentName: department.name,
      description: jobDescription.description,
      id: jobDescription.id,
      name: jobDescription.name,
      presetQuestions: jobDescription.presetQuestions,
      prompt: jobDescription.prompt,
      updatedAt: jobDescription.updatedAt,
    })
    .from(jobDescription)
    .leftJoin(department, eq(jobDescription.departmentId, department.id))
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

async function countJobDescriptionRows({
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
}: {
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
}) {
  const where = buildWhereConditions({
    departmentIds,
    interviewerIds,
    jdIdsForInterviewers,
    search,
  });
  const [result] = await db.select({ count: count() }).from(jobDescription).where(where);
  return result?.count ?? 0;
}

async function loadInterviewersForJobDescriptions(
  jobDescriptionIds: string[],
): Promise<Map<string, JobDescriptionInterviewerSummary[]>> {
  const map = new Map<string, JobDescriptionInterviewerSummary[]>();
  if (jobDescriptionIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      interviewerId: jobDescriptionInterviewer.interviewerId,
      interviewerName: interviewer.name,
      interviewerVoice: interviewer.voice,
      jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId,
    })
    .from(jobDescriptionInterviewer)
    .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
    .where(inArray(jobDescriptionInterviewer.jobDescriptionId, jobDescriptionIds))
    .orderBy(asc(interviewer.name));

  for (const id of jobDescriptionIds) {
    map.set(id, []);
  }
  for (const row of rows) {
    const list = map.get(row.jobDescriptionId);
    if (list) {
      list.push({
        id: row.interviewerId,
        name: row.interviewerName,
        voice: row.interviewerVoice as MinimaxVoiceId,
      });
    }
  }
  return map;
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toJobDescriptionListRecord(
  row: Awaited<ReturnType<typeof listJobDescriptionRows>>[number],
  interviewers: JobDescriptionInterviewerSummary[],
): JobDescriptionListRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    description: row.description,
    id: row.id,
    interviewerIds: interviewers.map((item) => item.id),
    interviewers,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
  };
}

// 多选过滤器在 URL/state 层用 CSV 字符串编码。后端这里把 CSV 切回 ID 数组。
// / Multi-select filters arrive as a comma-separated string; split into ids here.
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

function parseFilters(filters?: {
  search?: string | null;
  departmentId?: string | null;
  interviewerId?: string | null;
}) {
  const parsed = jobDescriptionListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { departmentIds: undefined, interviewerIds: undefined, search: undefined };
  }
  return {
    departmentIds: csvToIds(parsed.data.departmentId),
    interviewerIds: csvToIds(parsed.data.interviewerId),
    search: parsed.data.search?.trim() || undefined,
  };
}

export function parseJobDescriptionPagination(
  params?: Record<string, unknown>,
): JobDescriptionPaginationParams {
  return jobDescriptionPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedJobDescriptions(
  filters?: {
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedJobDescriptionResult> {
  const { search, departmentIds, interviewerIds } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseJobDescriptionPagination(pagination);
  const offset = (page - 1) * pageSize;
  const jdIdsForInterviewers = await resolveJdIdsForInterviewers(interviewerIds);

  const [records, total] = await Promise.all([
    listJobDescriptionRows({
      departmentIds,
      interviewerIds,
      jdIdsForInterviewers,
      limit: pageSize,
      offset,
      search,
      sortBy,
      sortOrder,
    }),
    countJobDescriptionRows({
      departmentIds,
      interviewerIds,
      jdIdsForInterviewers,
      search,
    }),
  ]);

  const interviewersMap = await loadInterviewersForJobDescriptions(
    records.map((record) => record.id),
  );

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toJobDescriptionListRecord(record, interviewersMap.get(record.id) ?? []),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listJobDescriptions(
  filters?: {
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("job-descriptions");
  cacheLife("minutes");

  return queryPaginatedJobDescriptions(filters, pagination);
}

// oxlint-disable-next-line require-await
export async function listAllJobDescriptions(): Promise<JobDescriptionListRecord[]> {
  "use cache";
  cacheTag("job-descriptions");
  cacheLife("minutes");

  const rows = await listJobDescriptionRows({ sortBy: "name", sortOrder: "asc" });
  const interviewersMap = await loadInterviewersForJobDescriptions(rows.map((row) => row.id));
  return rows.map((row) => toJobDescriptionListRecord(row, interviewersMap.get(row.id) ?? []));
}

/**
 * 校验给定 ids 全部存在于 jobDescription 表。空数组视作合法。
 * Validate that every id in `ids` exists in jobDescription. Empty input is valid.
 */
export async function jobDescriptionIdsExist(ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  const rows = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(inArray(jobDescription.id, ids));
  return rows.length === new Set(ids).size;
}

export async function loadJobDescriptionById(id: string): Promise<JobDescriptionRecord | null> {
  const [row] = await db.select().from(jobDescription).where(eq(jobDescription.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const interviewersMap = await loadInterviewersForJobDescriptions([id]);
  const interviewers = interviewersMap.get(id) ?? [];
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    interviewerIds: interviewers.map((item) => item.id),
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export function serializeJobDescription(
  row: typeof jobDescription.$inferSelect,
  interviewerIds: string[],
): JobDescriptionRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    interviewerIds,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    updatedAt: serializeDate(row.updatedAt),
  };
}
