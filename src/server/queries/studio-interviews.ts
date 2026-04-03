import type { StudioInterviewListRecord } from '@/lib/studio-interviews';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { studioInterview, studioInterviewSchedule } from '@/lib/db/schema';
import { buildInterviewLink, sortScheduleEntries } from '@/lib/interview/interview-record';
import { studioInterviewStatusSchema } from '@/lib/studio-interviews';

const studioInterviewListFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
  status: studioInterviewStatusSchema.or(z.literal('all')).optional().nullable(),
});

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

async function listStudioInterviewRows({
  search,
  status,
}: {
  search?: string
  status?: z.infer<typeof studioInterviewStatusSchema>
}) {
  const matchingScheduleRecordIds = search
    ? await findMatchingScheduleRecordIds(search)
    : [];
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

  return db.select({
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
  }).from(studioInterview).where(whereConditions.length > 0 ? and(...whereConditions) : undefined).orderBy(desc(studioInterview.createdAt));
}

function toStudioInterviewListRecord(record: StudioInterviewListRow, scheduleEntries: StudioInterviewScheduleRow[]): StudioInterviewListRecord {
  return {
    id: record.id,
    candidateName: record.candidateName,
    candidateEmail: record.candidateEmail,
    targetRole: record.targetRole,
    status: record.status,
    resumeFileName: record.resumeFileName,
    scheduleEntries: sortScheduleEntries(scheduleEntries.filter(entry => entry.interviewRecordId === record.id)),
    interviewLink: buildInterviewLink(record.id),
    notes: record.notes,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    questionCount: record.interviewQuestions?.length ?? 0,
  };
}

export async function listStudioInterviewRecords(filters?: {
  search?: string | null
  status?: string | null
}) {
  const parsed = studioInterviewListFiltersSchema.safeParse(filters ?? {});

  if (!parsed.success) {
    return [] as StudioInterviewListRecord[];
  }

  const search = parsed.data.search?.trim() || undefined;
  const status = parsed.data.status && parsed.data.status !== 'all'
    ? parsed.data.status
    : undefined;
  const records = await listStudioInterviewRows({ search, status });
  const scheduleEntries = await loadScheduleEntries(records.map(record => record.id));

  return records.map(record => toStudioInterviewListRecord(record, scheduleEntries));
}
