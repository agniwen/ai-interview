import { buildListTextFilterWhere } from "@server/lib/server/db/list-text-filters";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import type { InterviewerListRecord, InterviewerRecord } from "@app/shared/interviewers";
import { minimaxVoiceSchema } from "@app/db-schema/minimax-voices";
import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/lib/server/db/index";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@server/lib/server/db/pagination";
import type { PaginatedResult, PaginationParams } from "@server/lib/server/db/pagination";
import { serializeDate } from "@server/lib/server/db/serialize";
import { department, interviewer, jobDescriptionInterviewer } from "@app/db-schema/schema";

const interviewerListFiltersSchema = z.object({
  departmentId: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  textFilters: listTextFiltersSchema("interviewers"),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const ORDER_COLUMNS = {
  createdAt: interviewer.createdAt,
  name: interviewer.name,
  updatedAt: interviewer.updatedAt,
} as const;

const interviewerPaginationSchema = makePaginationSchema(SORT_COLUMNS);
const interviewerPaginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

export type InterviewerPaginationParams = PaginationParams<SortColumn>;
type InterviewerPaginationInput = z.input<typeof interviewerPaginationInputSchema>;

export type PaginatedInterviewerResult = PaginatedResult<InterviewerListRecord>;

function buildWhereConditions({
  organizationId,
  textFilters,
  search,
  departmentId,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  departmentId?: string;
}) {
  const orgFilter = eq(interviewer.organizationId, organizationId);
  type InterviewerWhereCondition =
    | ReturnType<typeof and>
    | ReturnType<typeof eq>
    | ReturnType<typeof or>;
  const conditions: InterviewerWhereCondition[] = [orgFilter];

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
  const atomic = buildListTextFilterWhere("interviewers", textFilters, {
    description: interviewer.description,
    name: interviewer.name,
  });
  if (atomic) {
    conditions.push(atomic);
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions);
}

function listInterviewerRows({
  organizationId,
  textFilters,
  search,
  departmentId,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  departmentId?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ departmentId, organizationId, search, textFilters });

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
    .orderBy(buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder))
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
  organizationId,
  textFilters,
  search,
  departmentId,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  departmentId?: string;
}) {
  const where = buildWhereConditions({ departmentId, organizationId, search, textFilters });
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

function parseFilters(filters?: {
  textFilters?: string;
  search?: string | null;
  departmentId?: string | null;
}) {
  const parsed = interviewerListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { departmentId: undefined, search: undefined, textFilters: undefined };
  }
  return {
    departmentId: parsed.data.departmentId?.trim() || undefined,
    search: parsed.data.search?.trim() || undefined,
    textFilters: parsed.data.textFilters,
  };
}

export function parseInterviewerPagination(
  params?: InterviewerPaginationInput,
): InterviewerPaginationParams {
  return interviewerPaginationSchema.parse(interviewerPaginationInputSchema.parse(params ?? {}));
}

export async function queryPaginatedInterviewers(
  organizationId: string,
  filters?: { textFilters?: string; search?: string | null; departmentId?: string | null },
  pagination?: InterviewerPaginationInput,
): Promise<PaginatedInterviewerResult> {
  const { textFilters, search, departmentId } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseInterviewerPagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listInterviewerRows({
      departmentId,
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
      textFilters,
    }),
    countInterviewerRows({ departmentId, organizationId, search, textFilters }),
  ]);

  const countsMap = await loadJobDescriptionCounts(records.map((record) => record.id));

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toInterviewerListRecord(record, countsMap.get(record.id) ?? 0),
    ),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listInterviewers(
  organizationId: string,
  filters?: { textFilters?: string; search?: string | null; departmentId?: string | null },
  pagination?: InterviewerPaginationInput,
) {
  return queryPaginatedInterviewers(organizationId, filters, pagination);
}

export async function listAllInterviewers(
  organizationId: string,
): Promise<InterviewerListRecord[]> {
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
    .where(eq(interviewer.organizationId, organizationId))
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

export async function loadInterviewerById(
  id: string,
  organizationId: string,
): Promise<InterviewerRecord | null> {
  const [row] = await db
    .select()
    .from(interviewer)
    .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, organizationId)))
    .limit(1);
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
    voice: minimaxVoiceSchema.parse(row.voice),
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
    voice: minimaxVoiceSchema.parse(row.voice),
  };
}
