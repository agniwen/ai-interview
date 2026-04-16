import type { StudioInterviewListRecord } from '@/lib/studio-interviews';
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { studioInterview, studioInterviewSchedule } from '@/lib/db/schema';
import { buildInterviewLink, sortScheduleEntries } from '@/lib/interview/interview-record';
import { studioInterviewStatusSchema } from '@/lib/studio-interviews';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const studioInterviewListFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
  status: studioInterviewStatusSchema.or(z.literal('all')).optional().nullable(),
});

const SORT_COLUMNS = ['createdAt', 'candidateName', 'updatedAt'] as const;
type SortColumn = typeof SORT_COLUMNS[number];

const studioInterviewPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type StudioInterviewPaginationParams = z.infer<typeof studioInterviewPaginationSchema>;

export interface PaginatedStudioInterviewResult {
  records: StudioInterviewListRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type StudioInterviewListRow = Awaited<ReturnType<typeof listStudioInterviewRows>>[number];
type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

async function loadScheduleEntries(interviewIds: string[]) {
  if (interviewIds.length === 0) {
    return [] as StudioInterviewScheduleRow[];
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

  return rows.map(row => row.interviewRecordId);
}

function buildWhereConditions({
  search,
  status,
  matchingScheduleRecordIds,
}: {
  search?: string
  status?: z.infer<typeof studioInterviewStatusSchema>
  matchingScheduleRecordIds: string[]
}) {
  const searchConditions = search
    ? [
        ilike(studioInterview.candidateName, `%${search}%`),
        ilike(studioInterview.candidateEmail, `%${search}%`),
        ilike(studioInterview.resumeFileName, `%${search}%`),
        ilike(studioInterview.targetRole, `%${search}%`),
        ...(matchingScheduleRecordIds.length > 0 ? [inArray(studioInterview.id, matchingScheduleRecordIds)] : []),
      ]
    : [];
  const whereConditions = [
    searchConditions.length > 0 ? or(...searchConditions) : undefined,
    status ? eq(studioInterview.status, status) : undefined,
  ].filter(Boolean);

  return whereConditions.length > 0 ? and(...whereConditions) : undefined;
}

function buildOrderBy(sortBy: SortColumn, sortOrder: 'asc' | 'desc') {
  const columnMap = {
    createdAt: studioInterview.createdAt,
    candidateName: studioInterview.candidateName,
    updatedAt: studioInterview.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === 'asc' ? asc(column) : desc(column);
}

const SELECTED_COLUMNS = {
  id: studioInterview.id,
  candidateName: studioInterview.candidateName,
  candidateEmail: studioInterview.candidateEmail,
  targetRole: studioInterview.targetRole,
  status: studioInterview.status,
  resumeFileName: studioInterview.resumeFileName,
  interviewQuestions: studioInterview.interviewQuestions,
  notes: studioInterview.notes,
  createdBy: studioInterview.createdBy,
  createdAt: studioInterview.createdAt,
  updatedAt: studioInterview.updatedAt,
} as const;

async function listStudioInterviewRows({
  search,
  status,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  limit,
  offset,
}: {
  search?: string
  status?: z.infer<typeof studioInterviewStatusSchema>
  sortBy?: SortColumn
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}) {
  const matchingScheduleRecordIds = search
    ? await findMatchingScheduleRecordIds(search)
    : [];
  const where = buildWhereConditions({ search, status, matchingScheduleRecordIds });

  let query = db.select(SELECTED_COLUMNS).from(studioInterview).where(where).orderBy(buildOrderBy(sortBy, sortOrder)).$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

async function countStudioInterviewRows({
  search,
  status,
}: {
  search?: string
  status?: z.infer<typeof studioInterviewStatusSchema>
}) {
  const matchingScheduleRecordIds = search
    ? await findMatchingScheduleRecordIds(search)
    : [];
  const where = buildWhereConditions({ search, status, matchingScheduleRecordIds });

  const [result] = await db.select({ count: count() }).from(studioInterview).where(where);
  return result?.count ?? 0;
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toStudioInterviewListRecord(record: StudioInterviewListRow, scheduleEntries: StudioInterviewScheduleRow[]): StudioInterviewListRecord {
  return {
    id: record.id,
    candidateName: record.candidateName,
    candidateEmail: record.candidateEmail,
    targetRole: record.targetRole,
    status: record.status,
    resumeFileName: record.resumeFileName,
    scheduleEntries: sortScheduleEntries(
      scheduleEntries
        .filter(entry => entry.interviewRecordId === record.id)
        .map(entry => ({
          ...entry,
          scheduledAt: entry.scheduledAt ? serializeDate(entry.scheduledAt) : null,
          createdAt: serializeDate(entry.createdAt),
          updatedAt: serializeDate(entry.updatedAt),
        })),
    ),
    interviewLink: buildInterviewLink(record.id),
    notes: record.notes,
    createdBy: record.createdBy,
    createdAt: serializeDate(record.createdAt),
    updatedAt: serializeDate(record.updatedAt),
    questionCount: record.interviewQuestions?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parseFilters(filters?: { search?: string | null, status?: string | null }) {
  const parsed = studioInterviewListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success)
    return { search: undefined, status: undefined };

  return {
    search: parsed.data.search?.trim() || undefined,
    status: parsed.data.status && parsed.data.status !== 'all'
      ? parsed.data.status
      : undefined,
  };
}

export function parsePagination(params?: Record<string, unknown>): StudioInterviewPaginationParams {
  return studioInterviewPaginationSchema.parse(params ?? {});
}

async function queryStudioInterviewRecords(filters?: {
  search?: string | null
  status?: string | null
}) {
  const { search, status } = parseFilters(filters);
  const records = await listStudioInterviewRows({ search, status });
  const scheduleEntries = await loadScheduleEntries(records.map(record => record.id));

  return records.map(record => toStudioInterviewListRecord(record, scheduleEntries));
}

async function queryPaginatedStudioInterviewRecords(
  filters?: { search?: string | null, status?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedStudioInterviewResult> {
  const { search, status } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parsePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [records, total] = await Promise.all([
    listStudioInterviewRows({ search, status, sortBy, sortOrder, limit: pageSize, offset }),
    countStudioInterviewRows({ search, status }),
  ]);

  const scheduleEntries = await loadScheduleEntries(records.map(record => record.id));

  return {
    records: records.map(record => toStudioInterviewListRecord(record, scheduleEntries)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Cached version for Server Components */
export async function listStudioInterviewRecords(
  filters?: { search?: string | null, status?: string | null },
  pagination?: Record<string, unknown>,
) {
  'use cache';
  cacheTag('studio-interviews');
  cacheLife('minutes');

  return queryPaginatedStudioInterviewRecords(filters, pagination);
}

/** Uncached version for API route handlers */
export { queryPaginatedStudioInterviewRecords, queryStudioInterviewRecords };
