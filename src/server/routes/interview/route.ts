import type { ScheduleEntryStatus } from '@/lib/studio-interviews';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from '@/lib/db/schema';
import {
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  studioInterviewFormSchema,
  studioInterviewUpdateSchema,
  toNullableString,
} from '@/lib/studio-interviews';
import { analyzeResumeFile, ResumeAnalysisError } from '@/server/agents/resume-analysis-agent';
import { factory } from '@/server/factory';
import { queryInterviewConversationReports } from '@/server/queries/interview-conversations';
import { queryStudioInterviewRecords } from '@/server/queries/studio-interviews';
import { interviewSessionSyncSchema } from './schema';
import {
  buildScheduleRows,
  buildTokenErrorResponse,
  deriveEndedAt,
  loadCandidateInterviewRecord,
  loadConversationSnapshot,
  loadRecordById,
  loadScheduleEntriesForRedirect,
  normalizeResumeFile,
  normalizeTranscript,
  safeUpdateTag,
  serializeRecord,
  toBadRequest,
  upsertConversation,
} from './utils';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

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

    const [snapshot, scheduleEntry] = await Promise.all([
      loadConversationSnapshot({
        conversationId: payload.conversationId,
        interviewRecordId: id,
      }),
      db.select({ status: studioInterviewSchedule.status })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .limit(1)
        .then(rows => rows[0] ?? null),
    ]);

    return c.json({
      received: true,
      snapshot,
      currentRoundStatus: (scheduleEntry?.status as ScheduleEntryStatus) ?? null,
    });
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
      const editedQuestionsRaw = toNullableString(formData.get('editedQuestions'));
      const editedQuestions = editedQuestionsRaw ? (JSON.parse(editedQuestionsRaw) as typeof existing.interviewQuestions) : null;

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

      const existingScheduleRows = await db
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, id));
      const scheduleRows = buildScheduleRows(id, input.data.scheduleEntries, now, existingScheduleRows);

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
        interviewQuestions: analysis?.interviewQuestions ?? editedQuestions ?? existing.interviewQuestions,
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
      await tx.update(studioInterviewSchedule).set({
        status: 'pending',
        conversationId: null,
        updatedAt: now,
      }).where(eq(studioInterviewSchedule.id, roundId));

      if (existing.status === 'completed') {
        await tx.update(studioInterview).set({
          status: 'in_progress',
          updatedAt: now,
        }).where(eq(studioInterview.id, id));
      }

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
