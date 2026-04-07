import type { StudioInterviewRecord } from '@/lib/studio-interviews';
import { eq, inArray } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { db } from '@/lib/db';
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from '@/lib/db/schema';
import { buildInterviewLink, sortScheduleEntries } from '@/lib/interview/interview-record';
import {
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  studioInterviewFormSchema,
  studioInterviewUpdateSchema,
  toNullableString,
} from '@/lib/studio-interviews';
import { factory } from '@/server/factory';
import { queryInterviewConversationReports } from '@/server/queries/interview-conversations';
import { queryStudioInterviewRecords } from '@/server/queries/studio-interviews';
import { analyzeResumeFile, ResumeAnalysisError } from '../interview/analysis';

function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  }
  catch {
    // updateTag may throw in certain route handler contexts — non-critical
  }
}

type StudioInterviewRow = typeof studioInterview.$inferSelect;
type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

function normalizeResumeFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

function buildScheduleRows(
  interviewRecordId: string,
  entries: ReturnType<typeof parseScheduleEntriesInput>,
  now: Date,
  existingRows?: StudioInterviewScheduleRow[],
) {
  const existingMap = new Map((existingRows ?? []).map(row => [row.id, row]));

  return entries.map((entry, index) => {
    const existing = entry.id ? existingMap.get(entry.id.trim()) : undefined;

    return {
      id: entry.id?.trim() || crypto.randomUUID(),
      interviewRecordId,
      roundLabel: entry.roundLabel.trim(),
      status: existing?.status ?? ('pending' as const),
      scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
      notes: entry.notes?.trim() || null,
      sortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : index,
      conversationId: existing?.conversationId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  });
}

async function loadScheduleEntries(interviewIds: string[]) {
  if (interviewIds.length === 0) {
    return [] as StudioInterviewScheduleRow[];
  }

  return db.select().from(studioInterviewSchedule).where(inArray(studioInterviewSchedule.interviewRecordId, interviewIds));
}

function serializeRecord(record: StudioInterviewRow, scheduleRows: StudioInterviewScheduleRow[]): StudioInterviewRecord {
  const scheduleEntries = sortScheduleEntries(
    scheduleRows.filter(schedule => schedule.interviewRecordId === record.id),
  );

  return {
    ...record,
    interviewQuestions: record.interviewQuestions ?? [],
    scheduleEntries,
    interviewLink: buildInterviewLink(record.id),
  };
}

async function loadRecordById(id: string) {
  const [record] = await db.select().from(studioInterview).where(eq(studioInterview.id, id)).limit(1);

  if (!record) {
    return null;
  }

  const scheduleEntries = await loadScheduleEntries([record.id]);
  return serializeRecord(record, scheduleEntries);
}

function toBadRequest(error: unknown) {
  if (error instanceof ResumeAnalysisError) {
    return { error: error.message, stage: error.stage, status: 500 };
  }

  if (error instanceof Error) {
    const status = error.message.includes('PDF') || error.message.includes('10 MB') ? 400 : 400;
    return { error: error.message, status };
  }

  return { error: '表单校验失败。', status: 400 };
}

export const studioInterviewsRouter = factory.createApp()
  .get('/', async (c) => {
    const records = await queryStudioInterviewRecords({
      search: c.req.query('search'),
      status: c.req.query('status'),
    });

    return c.json(records);
  })
  .post('/', async (c) => {
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get('resume'));
      const parsedScheduleEntries = parseScheduleEntriesInput(formData.get('scheduleEntries'));
      const parsedResumePayload = parseResumePayloadInput(formData.get('resumePayload'));

      const input = studioInterviewFormSchema.safeParse({
        candidateName: toNullableString(formData.get('candidateName')) ?? '',
        candidateEmail: toNullableString(formData.get('candidateEmail')) ?? '',
        targetRole: toNullableString(formData.get('targetRole')) ?? '',
        notes: toNullableString(formData.get('notes')) ?? '',
        status: toNullableString(formData.get('status')) ?? 'ready',
        scheduleEntries: parsedScheduleEntries,
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? '表单校验失败。' }, 400);
      }

      const analysis = parsedResumePayload ?? (resume ? await analyzeResumeFile(resume) : null);
      const now = new Date();
      const interviewRecordId = crypto.randomUUID();
      const record = {
        id: interviewRecordId,
        candidateName: input.data.candidateName || analysis?.resumeProfile.name || '未命名候选人',
        candidateEmail: input.data.candidateEmail || null,
        targetRole: input.data.targetRole || analysis?.resumeProfile.targetRoles[0] || null,
        status: input.data.status,
        resumeFileName: analysis?.fileName ?? null,
        resumeProfile: analysis?.resumeProfile ?? null,
        interviewQuestions: analysis?.interviewQuestions ?? [],
        notes: input.data.notes || null,
        createdBy: c.var.user?.id ?? null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;
      const scheduleRows = buildScheduleRows(interviewRecordId, input.data.scheduleEntries, now);

      await db.transaction(async (tx) => {
        await tx.insert(studioInterview).values(record);
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
      });

      safeUpdateTag('studio-interviews');
      return c.json(serializeRecord(record, scheduleRows), 201);
    }
    catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as any });
    }
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const record = await loadRecordById(id);

    if (!record) {
      return c.json({ error: '记录不存在。' }, 404);
    }

    return c.json(record);
  })
  .get('/:id/reports', async (c) => {
    const id = c.req.param('id');
    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: '记录不存在。' }, 404);
    }

    const reports = await queryInterviewConversationReports(id);
    return c.json(reports);
  })
  .patch('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const existing = await loadRecordById(id);

      if (!existing) {
        return c.json({ error: '记录不存在。' }, 404);
      }

      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get('resume'));
      const parsedScheduleEntries = parseScheduleEntriesInput(formData.get('scheduleEntries'));
      const parsedResumePayload = parseResumePayloadInput(formData.get('resumePayload'));

      const input = studioInterviewUpdateSchema.safeParse({
        candidateName: toNullableString(formData.get('candidateName')) ?? '',
        candidateEmail: toNullableString(formData.get('candidateEmail')) ?? '',
        targetRole: toNullableString(formData.get('targetRole')) ?? '',
        notes: toNullableString(formData.get('notes')) ?? '',
        status: toNullableString(formData.get('status')) ?? existing.status,
        scheduleEntries: parsedScheduleEntries,
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? '表单校验失败。' }, 400);
      }

      const analysis = parsedResumePayload ?? (resume ? await analyzeResumeFile(resume) : null);
      const now = new Date();

      // Preserve existing round statuses when rebuilding schedule rows
      const existingScheduleRows = await db
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, id));
      const scheduleRows = buildScheduleRows(id, input.data.scheduleEntries, now, existingScheduleRows);

      // If interview was completed but new pending rounds exist, revert to in_progress
      const hasPendingRounds = scheduleRows.some(r => r.status === 'pending');
      let resolvedStatus = input.data.status;

      if (resolvedStatus === 'completed' && hasPendingRounds) {
        resolvedStatus = 'in_progress';
      }

      const nextRecord = {
        candidateName: input.data.candidateName || analysis?.resumeProfile.name || existing.candidateName,
        candidateEmail: input.data.candidateEmail || null,
        targetRole: input.data.targetRole || analysis?.resumeProfile.targetRoles[0] || null,
        status: resolvedStatus,
        resumeFileName: analysis?.fileName ?? existing.resumeFileName,
        resumeProfile: analysis?.resumeProfile ?? existing.resumeProfile,
        interviewQuestions: analysis?.interviewQuestions ?? existing.interviewQuestions,
        notes: input.data.notes || null,
        updatedAt: now,
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db.transaction(async (tx) => {
        await tx.update(studioInterview).set(nextRecord).where(eq(studioInterview.id, id));
        await tx.delete(studioInterviewSchedule).where(eq(studioInterviewSchedule.interviewRecordId, id));
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
      });

      safeUpdateTag('studio-interviews');
      const updatedRecord = await loadRecordById(id);
      return c.json(updatedRecord);
    }
    catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as any });
    }
  })
  .post('/:id/rounds/:roundId/reset', async (c) => {
    const id = c.req.param('id');
    const roundId = c.req.param('roundId');
    const operatorId = c.var.user?.id ?? null;

    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: '记录不存在。' }, 404);
    }

    const targetEntry = existing.scheduleEntries.find(e => e.id === roundId);

    if (!targetEntry) {
      return c.json({ error: '轮次不存在。' }, 404);
    }

    if (targetEntry.status !== 'completed') {
      return c.json({ error: '只能重置已结束的轮次。' }, 400);
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // Reset round status to pending, clear conversationId
      await tx.update(studioInterviewSchedule).set({
        status: 'pending',
        conversationId: null,
        updatedAt: now,
      }).where(eq(studioInterviewSchedule.id, roundId));

      // If interview was completed, revert to in_progress since there is now a pending round
      if (existing.status === 'completed') {
        await tx.update(studioInterview).set({
          status: 'in_progress',
          updatedAt: now,
        }).where(eq(studioInterview.id, id));
      }

      // Write audit log
      await tx.insert(interviewAuditLog).values({
        id: crypto.randomUUID(),
        interviewRecordId: id,
        scheduleEntryId: roundId,
        action: 'round_reset',
        detail: {
          roundLabel: targetEntry.roundLabel,
          previousStatus: targetEntry.status,
          previousConversationId: targetEntry.conversationId,
        },
        operatorId,
        createdAt: now,
      });
    });

    safeUpdateTag('studio-interviews');
    safeUpdateTag('interview-conversations');
    const updatedRecord = await loadRecordById(id);
    return c.json(updatedRecord);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: '记录不存在。' }, 404);
    }

    await db.delete(studioInterview).where(eq(studioInterview.id, id));
    safeUpdateTag('studio-interviews');
    return c.json({ success: true });
  });
