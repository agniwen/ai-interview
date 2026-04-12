import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from '@/lib/db/schema';
import { factory } from '@/server/factory';
import { safeUpdateTag } from '@/server/routes/interview/utils';

const transcriptTurnSchema = z.object({
  role: z.enum(['agent', 'user']),
  message: z.string(),
  timeInCallSecs: z.number().optional(),
});

const reportPayloadSchema = z.object({
  conversationId: z.string().min(1),
  interviewRecordId: z.string().min(1),
  scheduleEntryId: z.string().min(1),
  agentId: z.string().nullish(),
  status: z.string().default('completed'),
  callSuccessful: z.string().nullish(),
  transcript: z.array(transcriptTurnSchema).default([]),
  transcriptSummary: z.string().nullish(),
  evaluationCriteriaResults: z.record(z.string(), z.unknown()).nullish(),
  startedAt: z.string().nullish(),
  endedAt: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const agentRouter = factory.createApp()
  .post('/report', async (c) => {
    const secret = c.req.header('X-Agent-Secret');
    const expectedSecret = process.env.AGENT_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = reportPayloadSchema.safeParse(await c.req.json());

    if (!body.success) {
      return c.json({ error: 'Invalid payload', details: body.error.flatten() }, 400);
    }

    const data = body.data;
    const now = new Date();

    await db.transaction(async (tx) => {
      // 1. Upsert interviewConversation
      await tx
        .insert(interviewConversation)
        .values({
          conversationId: data.conversationId,
          interviewRecordId: data.interviewRecordId,
          scheduleEntryId: data.scheduleEntryId,
          agentId: data.agentId ?? null,
          status: data.status,
          mode: 'voice',
          transcript: data.transcript,
          transcriptSummary: data.transcriptSummary ?? null,
          callSuccessful: data.callSuccessful ?? null,
          evaluationCriteriaResults: data.evaluationCriteriaResults ?? {},
          dataCollectionResults: {},
          metadata: data.metadata ?? {},
          dynamicVariables: {},
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
          endedAt: data.endedAt ? new Date(data.endedAt) : null,
          webhookReceivedAt: now,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: interviewConversation.conversationId,
          set: {
            status: data.status,
            transcript: data.transcript,
            transcriptSummary: data.transcriptSummary ?? null,
            callSuccessful: data.callSuccessful ?? null,
            evaluationCriteriaResults: data.evaluationCriteriaResults ?? {},
            metadata: data.metadata ?? {},
            startedAt: data.startedAt ? new Date(data.startedAt) : null,
            endedAt: data.endedAt ? new Date(data.endedAt) : null,
            webhookReceivedAt: now,
            lastSyncedAt: now,
          },
        });

      // 2. Delete old turns + batch insert new ones
      await tx
        .delete(interviewConversationTurn)
        .where(eq(interviewConversationTurn.conversationId, data.conversationId));

      if (data.transcript.length > 0) {
        const callStart = data.startedAt ? new Date(data.startedAt) : now;

        await tx.insert(interviewConversationTurn).values(
          data.transcript.map((turn, index) => ({
            id: `${data.conversationId}:turn:${index}`,
            conversationId: data.conversationId,
            interviewRecordId: data.interviewRecordId,
            role: turn.role,
            message: turn.message,
            source: 'agent_report' as const,
            timeInCallSecs: turn.timeInCallSecs != null ? Math.round(turn.timeInCallSecs) : null,
            createdAt: new Date(callStart.getTime() + (turn.timeInCallSecs ?? 0) * 1000),
            receivedAt: now,
          })),
        );
      }

      // 3. Update schedule entry
      await tx
        .update(studioInterviewSchedule)
        .set({
          conversationId: data.conversationId,
          status: 'completed' as const,
          updatedAt: now,
        })
        .where(eq(studioInterviewSchedule.id, data.scheduleEntryId));

      // 4. Check if all rounds completed → update interview status
      const pendingRounds = await tx
        .select({ id: studioInterviewSchedule.id })
        .from(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.interviewRecordId, data.interviewRecordId),
            ne(studioInterviewSchedule.status, 'completed'),
          ),
        );

      if (pendingRounds.length === 0) {
        await tx
          .update(studioInterview)
          .set({ status: 'completed' as const, updatedAt: now })
          .where(eq(studioInterview.id, data.interviewRecordId));
      }

      // 5. Audit log
      await tx.insert(interviewAuditLog).values({
        id: crypto.randomUUID(),
        interviewRecordId: data.interviewRecordId,
        scheduleEntryId: data.scheduleEntryId,
        action: 'agent_report_received',
        detail: {
          conversationId: data.conversationId,
          callSuccessful: data.callSuccessful,
          turnCount: data.transcript.length,
        },
        operatorId: null,
        createdAt: now,
      });
    });

    // 6. Invalidate caches
    safeUpdateTag('studio-interviews');
    safeUpdateTag('interview-conversations');
    safeUpdateTag(`interview-conversations-${data.interviewRecordId}`);

    return c.json({ conversationId: data.conversationId, success: true }, 201);
  });
