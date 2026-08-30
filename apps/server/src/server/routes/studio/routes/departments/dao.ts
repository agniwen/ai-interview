import { buildListTextFilterWhere } from "@app/server/lib/server/db/list-text-filters";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import type { DepartmentListRecord, DepartmentRecord } from "@arc/shared/departments";
import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@app/server/lib/server/db";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@app/server/lib/server/db/pagination";
import type { PaginatedResult, PaginationParams } from "@app/server/lib/server/db/pagination";
import { serializeDate } from "@app/server/lib/server/db/serialize";
import { department, interviewer, jobDescription } from "@arc/db-schema/schema";

const departmentListFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
  textFilters: listTextFiltersSchema("departments"),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const ORDER_COLUMNS = {
  createdAt: department.createdAt,
  name: department.name,
  updatedAt: department.updatedAt,
} as const;

const departmentPaginationSchema = makePaginationSchema(SORT_COLUMNS);

interface DepartmentPaginationInput {
  page?: number | string;
  pageSize?: number | string;
  sortBy?: string;
  sortOrder?: string;
}

export type DepartmentPaginationParams = PaginationParams<SortColumn>;

export type PaginatedDepartmentResult = PaginatedResult<DepartmentListRecord>;

function buildWhereConditions({
  organizationId,
  textFilters,
  search,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
}) {
  const orgFilter = eq(department.organizationId, organizationId);
  const atomic = buildListTextFilterWhere("departments", textFilters, {
    description: department.description,
    name: department.name,
  });
  if (!search) {
    return and(orgFilter, atomic);
  }

  return and(
    orgFilter,
    atomic,
    or(ilike(department.name, `%${search}%`), ilike(department.description, `%${search}%`)),
  );
}

function listDepartmentRows({
  organizationId,
  textFilters,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ organizationId, search, textFilters });

  let query = db
    .select()
    .from(department)
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

async function countDepartmentRows({
  organizationId,
  textFilters,
  search,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
}) {
  const where = buildWhereConditions({ organizationId, search, textFilters });
  const [result] = await db.select({ count: count() }).from(department).where(where);
  return result?.count ?? 0;
}

async function loadReferenceCounts(departmentIds: string[]) {
  if (departmentIds.length === 0) {
    return new Map<string, { interviewerCount: number; jobDescriptionCount: number }>();
  }

  const [interviewerRows, jobDescriptionRows] = await Promise.all([
    db
      .select({
        count: count(),
        departmentId: interviewer.departmentId,
      })
      .from(interviewer)
      .where(inArray(interviewer.departmentId, departmentIds))
      .groupBy(interviewer.departmentId),
    db
      .select({
        count: count(),
        departmentId: jobDescription.departmentId,
      })
      .from(jobDescription)
      .where(inArray(jobDescription.departmentId, departmentIds))
      .groupBy(jobDescription.departmentId),
  ]);

  const map = new Map<string, { interviewerCount: number; jobDescriptionCount: number }>();
  for (const id of departmentIds) {
    map.set(id, { interviewerCount: 0, jobDescriptionCount: 0 });
  }
  for (const row of interviewerRows) {
    const entry = map.get(row.departmentId);
    if (entry) {
      entry.interviewerCount = row.count;
    }
  }
  for (const row of jobDescriptionRows) {
    const entry = map.get(row.departmentId);
    if (entry) {
      entry.jobDescriptionCount = row.count;
    }
  }

  return map;
}

function toDepartmentListRecord(
  row: typeof department.$inferSelect,
  refs: { interviewerCount: number; jobDescriptionCount: number },
): DepartmentListRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    interviewerCount: refs.interviewerCount,
    jobDescriptionCount: refs.jobDescriptionCount,
    name: row.name,
    updatedAt: serializeDate(row.updatedAt),
  };
}

function parseFilters(filters?: { textFilters?: string; search?: string | null }) {
  const parsed = departmentListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { search: undefined, textFilters: undefined };
  }
  return { search: parsed.data.search?.trim() || undefined, textFilters: parsed.data.textFilters };
}

export function parseDepartmentPagination(
  params?: DepartmentPaginationInput,
): DepartmentPaginationParams {
  return departmentPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedDepartments(
  filters: { organizationId: string; textFilters?: string; search?: string | null },
  pagination?: DepartmentPaginationInput,
): Promise<PaginatedDepartmentResult> {
  const { textFilters, search } = parseFilters(filters);
  const { organizationId } = filters;
  const { page, pageSize, sortBy, sortOrder } = parseDepartmentPagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listDepartmentRows({
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
      textFilters,
    }),
    countDepartmentRows({ organizationId, search, textFilters }),
  ]);

  const refsMap = await loadReferenceCounts(records.map((record) => record.id));

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toDepartmentListRecord(
        record,
        refsMap.get(record.id) ?? { interviewerCount: 0, jobDescriptionCount: 0 },
      ),
    ),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listDepartments(
  filters: { organizationId: string; textFilters?: string; search?: string | null },
  pagination?: DepartmentPaginationInput,
) {
  return queryPaginatedDepartments(filters, pagination);
}

/** Load all departments (small list, used for selects). */
export async function listAllDepartments(organizationId: string): Promise<DepartmentRecord[]> {
  const rows = await db
    .select()
    .from(department)
    .where(eq(department.organizationId, organizationId))
    .orderBy(asc(department.name));
  return rows.map((row) => ({
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    name: row.name,
    updatedAt: serializeDate(row.updatedAt),
  }));
}

export async function loadDepartmentReferenceCounts(id: string) {
  const [interviewerCountResult, jobDescriptionCountResult] = await Promise.all([
    db.select({ count: count() }).from(interviewer).where(eq(interviewer.departmentId, id)),
    db.select({ count: count() }).from(jobDescription).where(eq(jobDescription.departmentId, id)),
  ]);

  return {
    interviewerCount: interviewerCountResult[0]?.count ?? 0,
    jobDescriptionCount: jobDescriptionCountResult[0]?.count ?? 0,
  };
}

export async function loadDepartmentById(
  id: string,
  organizationId: string,
): Promise<DepartmentRecord | null> {
  const [row] = await db
    .select()
    .from(department)
    .where(and(eq(department.id, id), eq(department.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    name: row.name,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export function serializeDepartment(row: typeof department.$inferSelect): DepartmentRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    name: row.name,
    updatedAt: serializeDate(row.updatedAt),
  };
}
