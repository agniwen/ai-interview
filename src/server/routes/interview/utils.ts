import type {
  InterviewConversationSnapshot,
  InterviewTranscriptTurn,
  PersistedInterviewTurn,
} from '@/lib/interview-session';
import type { ScheduleEntryStatus, StudioInterviewRecord } from '@/lib/studio-interviews';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { db } from '@/lib/db';
import {
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from '@/lib/db/schema';
import {
  buildCandidateInterviewView,
  buildInterviewLink,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from '@/lib/interview/interview-record';
import { ResumeAnalysisError } from '@/server/agents/resume-analysis-agent';
import type { parseScheduleEntriesInput } from '@/lib/studio-interviews';

export type InterviewConversationRow = typeof interviewConversation.$inferSelect;
export type InterviewConversationTurnRow = typeof interviewConversationTurn.$inferSelect;
export type StudioInterviewRow = typeof studioInterview.$inferSelect;
export type StudioInterviewScheduleRow = typeof studioInterviewSchedule.$inferSelect;

// =====================================================================
// Cache tag helper
// =====================================================================

export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  }
  catch {
    // updateTag may throw in certain route handler contexts — non-critical
  }
}

// =====================================================================
// Candidate interview record loaders
// =====================================================================

export async function loadCandidateInterviewRecord(id: string, roundId: string) {
  const [record] = await db.select().from(studioInterview).where(eq(studioInterview.id, id)).limit(1);

  if (!record || record.status === 'archived') {
    return null;
  }

  const scheduleEntries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  return buildCandidateInterviewView(record, sortScheduleEntries(scheduleEntries), roundId);
}

export async function loadScheduleEntriesForRedirect(id: string) {
  const [record] = await db
    .select({ id: studioInterview.id, status: studioInterview.status })
    .from(studioInterview)
    .where(eq(studioInterview.id, id))
    .limit(1);

  if (!record || record.status === 'archived') {
    return null;
  }

  const entries = await db
    .select()
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, id));

  const sorted = sortScheduleEntries(entries);
  const active = pickCurrentScheduleEntry(sorted);
  return active;
}

export function buildTokenErrorResponse() {
  return {
    error: '语音通话服务配置缺失，请联系管理员检查环境变量。',
  };
}

// =====================================================================
// Conversation transcript helpers
// =====================================================================

export function normalizeTranscript(value: unknown): InterviewTranscriptTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === 'object')
    .filter(turn => turn.role === 'agent' || turn.role === 'user')
    .map(turn => ({
      role: turn.role as 'agent' | 'user',
      message: typeof turn.message === 'string' ? turn.message : '',
      timeInCallSecs: typeof turn.time_in_call_secs === 'number' ? turn.time_in_call_secs : undefined,
    }))
    .filter(turn => turn.message.trim().length > 0);
}

export function buildFallbackTurns(conversation: InterviewConversationRow): PersistedInterviewTurn[] {
  const turns = conversation.transcript ?? [];
  const fallbackCreatedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;
  const fallbackReceivedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;

  return turns.map((turn, index) => ({
    id: `${conversation.conversationId}:webhook:${index}`,
    conversationId: conversation.conversationId,
    interviewRecordId: conversation.interviewRecordId,
    role: turn.role,
    message: turn.message,
    source: 'post_call_transcription',
    timeInCallSecs: turn.timeInCallSecs ?? null,
    createdAt: fallbackCreatedAt,
    receivedAt: fallbackReceivedAt,
  }));
}

export function serializeConversationSnapshot(
  conversation: InterviewConversationRow,
  turnRows: InterviewConversationTurnRow[],
): InterviewConversationSnapshot {
  return {
    conversationId: conversation.conversationId,
    interviewRecordId: conversation.interviewRecordId,
    agentId: conversation.agentId,
    status: conversation.status,
    mode: conversation.mode,
    callSuccessful: conversation.callSuccessful,
    transcriptSummary: conversation.transcriptSummary,
    evaluationCriteriaResults: conversation.evaluationCriteriaResults ?? {},
    dataCollectionResults: conversation.dataCollectionResults ?? {},
    metadata: conversation.metadata ?? {},
    dynamicVariables: conversation.dynamicVariables ?? {},
    latestError: conversation.latestError,
    startedAt: conversation.startedAt,
    endedAt: conversation.endedAt,
    webhookReceivedAt: conversation.webhookReceivedAt,
    lastSyncedAt: conversation.lastSyncedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    turns: turnRows.length > 0 ? turnRows : buildFallbackTurns(conversation),
  };
}

export async function loadConversationSnapshot(options: { conversationId: string, interviewRecordId?: string }) {
  const filters = options.interviewRecordId
    ? and(
        eq(interviewConversation.conversationId, options.conversationId),
        eq(interviewConversation.interviewRecordId, options.interviewRecordId),
      )
    : eq(interviewConversation.conversationId, options.conversationId);
  const [conversation] = await db.select().from(interviewConversation).where(filters).limit(1);

  if (!conversation) {
    return null;
  }

  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(eq(interviewConversationTurn.conversationId, options.conversationId))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));

  return serializeConversationSnapshot(conversation, turnRows);
}

export function deriveEndedAt(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const startTime = typeof metadata.start_time_unix_secs === 'number'
    ? metadata.start_time_unix_secs * 1000
    : null;
  const durationMs = typeof metadata.call_duration_secs === 'number'
    ? metadata.call_duration_secs * 1000
    : null;

  if (startTime != null && durationMs != null) {
    return new Date(startTime + durationMs);
  }

  return null;
}

// =====================================================================
// Conversation / schedule / interview status sync
// =====================================================================

export async function syncInterviewStatus(interviewRecordId: string | null, now: Date) {
  if (!interviewRecordId) {
    return;
  }

  const [record] = await db
    .select({ status: studioInterview.status })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);

  if (!record || record.status === 'archived') {
    return;
  }

  const scheduleEntries = await db
    .select({ status: studioInterviewSchedule.status })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, interviewRecordId));

  const allCompleted = scheduleEntries.length > 0 && scheduleEntries.every(e => e.status === 'completed');
  const anyInProgress = scheduleEntries.some(e => e.status === 'in_progress');

  let nextStatus: 'in_progress' | 'completed' | null = null;

  if (allCompleted) {
    nextStatus = 'completed';
  }
  else if (anyInProgress || scheduleEntries.some(e => e.status === 'completed')) {
    nextStatus = 'in_progress';
  }

  if (!nextStatus || nextStatus === record.status) {
    return;
  }

  if (nextStatus === 'in_progress' && record.status !== 'ready' && record.status !== 'draft' && record.status !== 'completed') {
    return;
  }

  await db.update(studioInterview).set({ status: nextStatus, updatedAt: now }).where(eq(studioInterview.id, interviewRecordId));
}

export async function updateScheduleEntryStatus(
  scheduleEntryId: string,
  nextStatus: ScheduleEntryStatus,
  conversationId: string | null,
  now: Date,
) {
  await db
    .update(studioInterviewSchedule)
    .set({
      status: nextStatus,
      ...(conversationId ? { conversationId } : {}),
      updatedAt: now,
    })
    .where(and(
      eq(studioInterviewSchedule.id, scheduleEntryId),
      nextStatus === 'in_progress'
        ? eq(studioInterviewSchedule.status, 'pending')
        : nextStatus === 'completed'
          ? or(eq(studioInterviewSchedule.status, 'pending'), eq(studioInterviewSchedule.status, 'in_progress'))
          : eq(studioInterviewSchedule.status, studioInterviewSchedule.status),
    ));
}

export async function upsertConversation(options: {
  conversationId: string
  interviewRecordId?: string | null
  scheduleEntryId?: string | null
  agentId?: string | null
  status?: string
  mode?: string | null
  transcript?: InterviewTranscriptTurn[]
  transcriptSummary?: string | null
  callSuccessful?: string | null
  evaluationCriteriaResults?: Record<string, unknown>
  dataCollectionResults?: Record<string, unknown>
  metadata?: Record<string, unknown>
  dynamicVariables?: Record<string, unknown>
  latestError?: string | null
  turn?: {
    id: string
    eventId?: number
    role: 'agent' | 'user'
    text: string
    source: string
    createdAt: number
    timeInCallSecs?: number
  }
  webhookReceivedAt?: Date | null
  endedAt?: Date | null
  markStarted?: boolean
  markEnded?: boolean
}) {
  const now = new Date();
  let resolvedInterviewRecordId: string | null = options.interviewRecordId ?? null;
  let resolvedScheduleEntryId: string | null = options.scheduleEntryId ?? null;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, options.conversationId))
      .limit(1);

    const nextInterviewRecordId = options.interviewRecordId ?? existing?.interviewRecordId ?? null;
    const nextScheduleEntryId = options.scheduleEntryId ?? existing?.scheduleEntryId ?? null;
    resolvedInterviewRecordId = nextInterviewRecordId;
    resolvedScheduleEntryId = nextScheduleEntryId;
    const nextRow = {
      conversationId: options.conversationId,
      interviewRecordId: nextInterviewRecordId,
      scheduleEntryId: nextScheduleEntryId,
      agentId: options.agentId ?? existing?.agentId ?? null,
      status: options.status ?? existing?.status ?? 'initiated',
      mode: options.mode ?? existing?.mode ?? null,
      transcript: options.transcript ?? existing?.transcript ?? [],
      transcriptSummary: options.transcriptSummary ?? existing?.transcriptSummary ?? null,
      callSuccessful: options.callSuccessful ?? existing?.callSuccessful ?? null,
      evaluationCriteriaResults: options.evaluationCriteriaResults ?? existing?.evaluationCriteriaResults ?? {},
      dataCollectionResults: options.dataCollectionResults ?? existing?.dataCollectionResults ?? {},
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(options.metadata ?? {}),
      },
      dynamicVariables: {
        ...(existing?.dynamicVariables ?? {}),
        ...(options.dynamicVariables ?? {}),
      },
      latestError: options.latestError ?? existing?.latestError ?? null,
      startedAt: existing?.startedAt ?? (options.markStarted ? now : null),
      endedAt: options.endedAt ?? existing?.endedAt ?? (options.markEnded ? now : null),
      webhookReceivedAt: options.webhookReceivedAt ?? existing?.webhookReceivedAt ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    } satisfies typeof interviewConversation.$inferInsert;

    if (existing) {
      await tx
        .update(interviewConversation)
        .set(nextRow)
        .where(eq(interviewConversation.conversationId, options.conversationId));
    }
    else {
      await tx.insert(interviewConversation).values({
        ...nextRow,
        createdAt: now,
      });
    }

    if (options.turn) {
      const persistedTurnId = typeof options.turn.eventId === 'number'
        ? `${options.conversationId}:${options.turn.role}:${options.turn.source}:event:${options.turn.eventId}`
        : options.turn.id;

      await tx.insert(interviewConversationTurn).values({
        id: persistedTurnId,
        conversationId: options.conversationId,
        interviewRecordId: nextInterviewRecordId,
        role: options.turn.role,
        message: options.turn.text,
        source: options.turn.source,
        timeInCallSecs: options.turn.timeInCallSecs,
        createdAt: new Date(options.turn.createdAt),
        receivedAt: now,
      }).onConflictDoNothing();
    }
  });

  if (resolvedScheduleEntryId) {
    if (options.status === 'connected' || options.markStarted) {
      await updateScheduleEntryStatus(resolvedScheduleEntryId, 'in_progress', options.conversationId, now);
    }

    if (options.markEnded || options.status === 'done' || options.webhookReceivedAt) {
      await updateScheduleEntryStatus(resolvedScheduleEntryId, 'completed', options.conversationId, now);
    }
  }

  await syncInterviewStatus(resolvedInterviewRecordId, now);

  safeUpdateTag('interview-conversations');
  safeUpdateTag('studio-interviews');
}

// =====================================================================
// Studio interview (management) helpers
// =====================================================================

export function normalizeResumeFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : null;
}

export function buildScheduleRows(
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

export async function loadScheduleEntries(interviewIds: string[]) {
  if (interviewIds.length === 0) {
    return [] as StudioInterviewScheduleRow[];
  }

  return db
    .select()
    .from(studioInterviewSchedule)
    .where(inArray(studioInterviewSchedule.interviewRecordId, interviewIds));
}

export function serializeRecord(
  record: StudioInterviewRow,
  scheduleRows: StudioInterviewScheduleRow[],
): StudioInterviewRecord {
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

export async function loadRecordById(id: string) {
  const [record] = await db.select().from(studioInterview).where(eq(studioInterview.id, id)).limit(1);

  if (!record) {
    return null;
  }

  const scheduleEntries = await loadScheduleEntries([record.id]);
  return serializeRecord(record, scheduleEntries);
}

export function toBadRequest(error: unknown) {
  if (error instanceof ResumeAnalysisError) {
    return { error: error.message, stage: error.stage, status: 500 };
  }

  if (error instanceof Error) {
    const status = error.message.includes('PDF') || error.message.includes('10 MB') ? 400 : 400;
    return { error: error.message, status };
  }

  return { error: '表单校验失败。', status: 400 };
}
