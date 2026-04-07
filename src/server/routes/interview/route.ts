import type { InterviewConversationSnapshot, InterviewTranscriptTurn, PersistedInterviewTurn } from '@/lib/interview-session';
import type { ScheduleEntryStatus } from '@/lib/studio-interviews';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, or } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { db } from '@/lib/db';
import {
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from '@/lib/db/schema';
import { buildCandidateInterviewView, pickCurrentScheduleEntry, sortScheduleEntries } from '@/lib/interview/interview-record';
import { factory } from '@/server/factory';
import { analyzeResumeFile, ResumeAnalysisError } from './analysis';
import { interviewSessionSyncSchema } from './session-schema';

function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  }
  catch {
    // updateTag may throw in certain route handler contexts — non-critical
  }
}

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

type InterviewConversationRow = typeof interviewConversation.$inferSelect;
type InterviewConversationTurnRow = typeof interviewConversationTurn.$inferSelect;

async function loadCandidateInterviewRecord(id: string, roundId: string) {
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

async function loadScheduleEntriesForRedirect(id: string) {
  const [record] = await db.select({ id: studioInterview.id, status: studioInterview.status }).from(studioInterview).where(eq(studioInterview.id, id)).limit(1);

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

function buildTokenErrorResponse() {
  return {
    error: '语音通话服务配置缺失，请联系管理员检查环境变量。',
  };
}

function normalizeTranscript(value: unknown): InterviewTranscriptTurn[] {
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

function buildFallbackTurns(conversation: InterviewConversationRow): PersistedInterviewTurn[] {
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

function serializeConversationSnapshot(
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

async function loadConversationSnapshot(options: { conversationId: string, interviewRecordId?: string }) {
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

function deriveEndedAt(metadata: Record<string, unknown> | null | undefined) {
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

async function syncInterviewStatus(interviewRecordId: string | null, now: Date) {
  if (!interviewRecordId) {
    return;
  }

  const [record] = await db.select({ status: studioInterview.status }).from(studioInterview).where(eq(studioInterview.id, interviewRecordId)).limit(1);

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

  // Don't transition backward from in_progress to null, only forward or to in_progress if was ready/draft
  if (nextStatus === 'in_progress' && record.status !== 'ready' && record.status !== 'draft' && record.status !== 'completed') {
    return;
  }

  await db.update(studioInterview).set({ status: nextStatus, updatedAt: now }).where(eq(studioInterview.id, interviewRecordId));
}

async function updateScheduleEntryStatus(
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
      // Only allow forward: pending(0) → in_progress(1) → completed(2)
      nextStatus === 'in_progress'
        ? eq(studioInterviewSchedule.status, 'pending')
        : nextStatus === 'completed'
          ? or(eq(studioInterviewSchedule.status, 'pending'), eq(studioInterviewSchedule.status, 'in_progress'))
          : eq(studioInterviewSchedule.status, studioInterviewSchedule.status), // noop for 'pending'
    ));
}

async function upsertConversation(options: {
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

  // Sync schedule entry status
  if (resolvedScheduleEntryId) {
    if (options.status === 'connected' || options.markStarted) {
      await updateScheduleEntryStatus(resolvedScheduleEntryId, 'in_progress', options.conversationId, now);
    }

    if (options.markEnded || options.status === 'done' || options.webhookReceivedAt) {
      await updateScheduleEntryStatus(resolvedScheduleEntryId, 'completed', options.conversationId, now);
    }
  }

  // Sync overall interview status based on all round statuses
  await syncInterviewStatus(resolvedInterviewRecordId, now);

  safeUpdateTag('interview-conversations');
  safeUpdateTag('studio-interviews');
}

export const interviewRouter = factory.createApp()
  .post('/quick-start', async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get('resume');

    if (!(resume instanceof File)) {
      return c.json({ error: '缺少简历 PDF 文件。' }, 400);
    }

    try {
      const analysis = await analyzeResumeFile(resume);
      const now = new Date();
      const interviewRecordId = crypto.randomUUID();

      const record = {
        id: interviewRecordId,
        candidateName: analysis.resumeProfile.name || '未命名候选人',
        candidateEmail: null,
        targetRole: analysis.resumeProfile.targetRoles[0] || null,
        status: 'ready',
        resumeFileName: analysis.fileName,
        resumeProfile: analysis.resumeProfile,
        interviewQuestions: analysis.interviewQuestions,
        notes: null,
        createdBy: c.var.user?.id ?? null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;

      const scheduleRow = {
        id: crypto.randomUUID(),
        interviewRecordId,
        roundLabel: '快速面试',
        status: 'pending' as const,
        scheduledAt: now,
        notes: null,
        sortOrder: 0,
        conversationId: null,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof studioInterviewSchedule.$inferInsert;

      await db.transaction(async (tx) => {
        await tx.insert(studioInterview).values(record);
        await tx.insert(studioInterviewSchedule).values(scheduleRow);
      });

      return c.json({ interviewId: interviewRecordId, roundId: scheduleRow.id }, 201);
    }
    catch (error) {
      if (error instanceof ResumeAnalysisError) {
        return c.json({ error: error.message, stage: error.stage }, 500);
      }

      if (error instanceof Error) {
        const status = error.message.includes('PDF') || error.message.includes('10 MB') ? 400 : 500;
        return c.json({ error: error.message, stage: 'resume-parsing' }, status as any);
      }

      return c.json({ error: '简历解析失败，请重试。', stage: 'resume-parsing' }, 500);
    }
  })
  .post('/parse-resume', async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get('resume');

    if (!(resume instanceof File)) {
      return c.json({ error: '缺少简历 PDF 文件。' }, 400);
    }

    try {
      const analysis = await analyzeResumeFile(resume);

      return c.json(analysis);
    }
    catch (error) {
      if (error instanceof ResumeAnalysisError) {
        return c.json(
          {
            error: error.message,
            stage: error.stage,
            ...(error.resumeProfile ? { resumeProfile: error.resumeProfile } : {}),
          },
          500,
        );
      }

      if (error instanceof Error) {
        const status = error.message.includes('PDF') || error.message.includes('10 MB') ? 400 : 500;

        return c.json(
          {
            error: error.message,
            stage: 'resume-parsing',
          },
          status as any,
        );
      }

      return c.json(
        {
          error: 'Failed to analyze resume.',
          stage: 'resume-parsing',
        },
        500,
      );
    }
  })
  .post('/:id/:roundId/session-sync', zValidator('json', interviewSessionSyncSchema), async (c) => {
    const id = c.req.param('id');
    const roundId = c.req.param('roundId');
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: 'Interview not available.' }, 404);
    }

    if (!interviewRecord.currentRoundId) {
      return c.json({ error: 'Round not found.' }, 404);
    }

    const payload = c.req.valid('json');

    await upsertConversation({
      conversationId: payload.conversationId,
      interviewRecordId: id,
      scheduleEntryId: roundId,
      status: payload.status,
      mode: payload.mode,
      latestError: payload.error,
      markStarted: payload.status === 'connected',
      markEnded: payload.status === 'disconnected',
      turn: payload.turn
        ? {
            id: payload.turn.id,
            eventId: payload.turn.eventId,
            role: payload.turn.role,
            text: payload.turn.text,
            source: payload.turn.source,
            createdAt: payload.turn.createdAt,
            timeInCallSecs: payload.turn.timeInCallSecs,
          }
        : undefined,
    });

    const snapshot = await loadConversationSnapshot({
      conversationId: payload.conversationId,
      interviewRecordId: id,
    });

    return c.json({ received: true, snapshot });
  })
  .post('/webhook', async (c) => {
    const rawBody = await c.req.raw.text();
    const signature = c.req.header('elevenlabs-signature') ?? '';
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

    let event: any;

    try {
      if (webhookSecret) {
        event = await elevenlabs.webhooks.constructEvent(rawBody, signature, webhookSecret);
      }
      else {
        event = JSON.parse(rawBody);
      }
    }
    catch {
      return c.json({ error: 'Invalid webhook payload or signature.' }, 401);
    }

    if (!event?.data?.conversation_id) {
      return c.json({ received: true });
    }

    const dynamicVariables = event.data.conversation_initiation_client_data?.dynamic_variables;
    const interviewRecordId = typeof dynamicVariables?.interview_record_id === 'string'
      ? dynamicVariables.interview_record_id
      : null;
    const webhookReceivedAt = new Date();

    if (event.type === 'post_call_transcription') {
      const metadata = event.data.metadata && typeof event.data.metadata === 'object'
        ? event.data.metadata as Record<string, unknown>
        : {};

      await upsertConversation({
        conversationId: event.data.conversation_id,
        interviewRecordId,
        agentId: typeof event.data.agent_id === 'string' ? event.data.agent_id : null,
        status: typeof event.data.status === 'string' ? event.data.status : 'done',
        transcript: normalizeTranscript(event.data.transcript),
        transcriptSummary: typeof event.data.analysis?.transcript_summary === 'string' ? event.data.analysis.transcript_summary : null,
        callSuccessful: typeof event.data.analysis?.call_successful === 'string' ? event.data.analysis.call_successful : null,
        evaluationCriteriaResults: event.data.analysis?.evaluation_criteria_results ?? {},
        dataCollectionResults: event.data.analysis?.data_collection_results ?? {},
        metadata: {
          ...metadata,
          lastWebhookEventType: event.type,
          eventTimestamp: event.event_timestamp ?? null,
        },
        dynamicVariables: dynamicVariables && typeof dynamicVariables === 'object'
          ? dynamicVariables as Record<string, unknown>
          : {},
        webhookReceivedAt,
        endedAt: deriveEndedAt(metadata) ?? webhookReceivedAt,
        markEnded: true,
      });

      return c.json({ received: true });
    }

    if (event.type === 'call_initiation_failure') {
      await upsertConversation({
        conversationId: event.data.conversation_id,
        interviewRecordId,
        agentId: typeof event.data.agent_id === 'string' ? event.data.agent_id : null,
        status: 'failed',
        latestError: typeof event.data.failure_reason === 'string' ? event.data.failure_reason : 'call_initiation_failure',
        metadata: {
          failureReason: event.data.failure_reason ?? null,
          providerMetadata: event.data.metadata ?? {},
          lastWebhookEventType: event.type,
          eventTimestamp: event.event_timestamp ?? null,
        },
        dynamicVariables: dynamicVariables && typeof dynamicVariables === 'object'
          ? dynamicVariables as Record<string, unknown>
          : {},
        endedAt: webhookReceivedAt,
        markEnded: true,
      });

      return c.json({ received: true });
    }

    if (event.type === 'post_call_audio') {
      await upsertConversation({
        conversationId: event.data.conversation_id,
        interviewRecordId,
        agentId: typeof event.data.agent_id === 'string' ? event.data.agent_id : null,
        metadata: {
          audioWebhookReceivedAt: webhookReceivedAt.toISOString(),
          hasAudioWebhook: true,
          lastWebhookEventType: event.type,
          eventTimestamp: event.event_timestamp ?? null,
        },
        dynamicVariables: dynamicVariables && typeof dynamicVariables === 'object'
          ? dynamicVariables as Record<string, unknown>
          : {},
      });
    }

    return c.json({ received: true });
  })
  .get('/report/:conversationId', async (c) => {
    const conversationId = c.req.param('conversationId');
    const snapshot = await loadConversationSnapshot({ conversationId });

    if (!snapshot) {
      return c.json({ error: 'Report not ready.' }, 404);
    }

    return c.json(snapshot);
  })
  .get('/:id/session/:conversationId', async (c) => {
    const id = c.req.param('id');
    const snapshot = await loadConversationSnapshot({
      conversationId: c.req.param('conversationId'),
      interviewRecordId: id,
    });

    if (!snapshot) {
      return c.json({ error: 'Session not found.' }, 404);
    }

    return c.json(snapshot);
  })
  .get('/quota', async (c) => {
    try {
      const subscription = await elevenlabs.user.subscription.get();

      return c.json({
        tier: subscription.tier,
        characterCount: subscription.characterCount,
        characterLimit: subscription.characterLimit,
        characterRemaining: subscription.characterLimit - subscription.characterCount,
        nextResetUnix: subscription.nextCharacterCountResetUnix ?? null,
        status: subscription.status,
      });
    }
    catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : '无法获取额度信息。' },
        500,
      );
    }
  })
  .get('/:id/:roundId/token', async (c) => {
    const id = c.req.param('id');
    const roundId = c.req.param('roundId');
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: 'Interview not available.' }, 404);
    }

    if (!interviewRecord.currentRoundId) {
      return c.json({ error: 'Round not found.' }, 404);
    }

    if (interviewRecord.currentRoundStatus === 'completed') {
      return c.json({ error: '当前面试轮次已结束，如需重新面试请联系管理员。' }, 403);
    }

    const agentId = process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

    if (!agentId) {
      return c.json(buildTokenErrorResponse(), 500);
    }

    try {
      const result = await elevenlabs.conversationalAi.conversations.getSignedUrl({
        agentId,
      });

      return c.json({ signedUrl: result.signedUrl });
    }
    catch (error) {
      return c.json(
        {
          error: 'Failed to generate signed URL.',
          detail: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      );
    }
  })
  .get('/:id/resolve', async (c) => {
    const id = c.req.param('id');
    const entry = await loadScheduleEntriesForRedirect(id);

    if (!entry) {
      return c.json({ error: 'Interview not available.' }, 404);
    }

    return c.json({ interviewId: id, roundId: entry.id });
  })
  .get('/:id/:roundId', async (c) => {
    const id = c.req.param('id');
    const roundId = c.req.param('roundId');
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: 'Interview not available.' }, 404);
    }

    return c.json(interviewRecord);
  });
