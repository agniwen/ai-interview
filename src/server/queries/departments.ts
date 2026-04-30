import type { DepartmentListRecord, DepartmentRecord } from "@/lib/departments";
import { asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { department, interviewer, jobDescription } from "@/lib/db/schema";

const departmentListFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const departmentPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type DepartmentPaginationParams = z.infer<typeof departmentPaginationSchema>;

export interface PaginatedDepartmentResult {
  records: DepartmentListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({ search }: { search?: string }) {
  if (!search) {
    return;
  }

  return or(ilike(department.name, `%${search}%`), ilike(department.description, `%${search}%`));
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: department.createdAt,
    name: department.name,
    updatedAt: department.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function listDepartmentRows({
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ search });

  let query = db
    .select()
    .from(department)
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

async function countDepartmentRows({ search }: { search?: string }) {
  const where = buildWhereConditions({ search });
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

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
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

function parseFilters(filters?: { search?: string | null }) {
  const parsed = departmentListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { search: undefined };
  }
  return { search: parsed.data.search?.trim() || undefined };
}

export function parseDepartmentPagination(
  params?: Record<string, unknown>,
): DepartmentPaginationParams {
  return departmentPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedDepartments(
  filters?: { search?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedDepartmentResult> {
  const { search } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseDepartmentPagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listDepartmentRows({ limit: pageSize, offset, search, sortBy, sortOrder }),
    countDepartmentRows({ search }),
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
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listDepartments(
  filters?: { search?: string | null },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("departments");
  cacheLife("minutes");

  return queryPaginatedDepartments(filters, pagination);
}

/** Load all departments (small list, used for selects). */
// oxlint-disable-next-line require-await
export async function listAllDepartments(): Promise<DepartmentRecord[]> {
  "use cache";
  cacheTag("departments");
  cacheLife("minutes");

  const rows = await db.select().from(department).orderBy(asc(department.name));
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

export async function loadDepartmentById(id: string): Promise<DepartmentRecord | null> {
  const [row] = await db.select().from(department).where(eq(department.id, id)).limit(1);
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
