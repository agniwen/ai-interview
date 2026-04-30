import type {
  JobDescriptionInterviewerSummary,
  JobDescriptionListRecord,
  JobDescriptionRecord,
} from "@/lib/job-descriptions";
import type { MinimaxVoiceId } from "@/lib/minimax-voices";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
} from "@/lib/db/schema";

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
  departmentId,
  interviewerId,
  jdIdsForInterviewer,
}: {
  search?: string;
  departmentId?: string;
  interviewerId?: string;
  jdIdsForInterviewer?: string[];
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
  if (departmentId) {
    conditions.push(eq(jobDescription.departmentId, departmentId));
  }
  if (interviewerId) {
    if (!jdIdsForInterviewer || jdIdsForInterviewer.length === 0) {
      // No JD links this interviewer — short-circuit with an always-false clause.
      conditions.push(eq(jobDescription.id, "__never__"));
    } else {
      conditions.push(inArray(jobDescription.id, jdIdsForInterviewer));
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

async function resolveJdIdsForInterviewer(interviewerId?: string): Promise<string[] | undefined> {
  if (!interviewerId) {
    return;
  }
  const rows = await db
    .select({ jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId })
    .from(jobDescriptionInterviewer)
    .where(eq(jobDescriptionInterviewer.interviewerId, interviewerId));
  return rows.map((row) => row.jobDescriptionId);
}

function listJobDescriptionRows({
  search,
  departmentId,
  interviewerId,
  jdIdsForInterviewer,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  departmentId?: string;
  interviewerId?: string;
  jdIdsForInterviewer?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({
    departmentId,
    interviewerId,
    jdIdsForInterviewer,
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
  departmentId,
  interviewerId,
  jdIdsForInterviewer,
}: {
  search?: string;
  departmentId?: string;
  interviewerId?: string;
  jdIdsForInterviewer?: string[];
}) {
  const where = buildWhereConditions({
    departmentId,
    interviewerId,
    jdIdsForInterviewer,
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

function parseFilters(filters?: {
  search?: string | null;
  departmentId?: string | null;
  interviewerId?: string | null;
}) {
  const parsed = jobDescriptionListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { departmentId: undefined, interviewerId: undefined, search: undefined };
  }
  return {
    departmentId: parsed.data.departmentId?.trim() || undefined,
    interviewerId: parsed.data.interviewerId?.trim() || undefined,
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
  const { search, departmentId, interviewerId } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseJobDescriptionPagination(pagination);
  const offset = (page - 1) * pageSize;
  const jdIdsForInterviewer = await resolveJdIdsForInterviewer(interviewerId);

  const [records, total] = await Promise.all([
    listJobDescriptionRows({
      departmentId,
      interviewerId,
      jdIdsForInterviewer,
      limit: pageSize,
      offset,
      search,
      sortBy,
      sortOrder,
    }),
    countJobDescriptionRows({ departmentId, interviewerId, jdIdsForInterviewer, search }),
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
