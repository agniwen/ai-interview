import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/db/schema";
import { factory } from "@/server/factory";
import { safeUpdateTag } from "@/server/routes/interview/utils";

const transcriptTurnSchema = z.object({
  message: z.string(),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().optional(),
});

const reportPayloadSchema = z.object({
  agentId: z.string().nullish(),
  callSuccessful: z.string().nullish(),
  conversationId: z.string().min(1),
  endedAt: z.string().nullish(),
  evaluationCriteriaResults: z.record(z.string(), z.unknown()).nullish(),
  interviewRecordId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  scheduleEntryId: z.string().min(1),
  startedAt: z.string().nullish(),
  status: z.string().default("completed"),
  transcript: z.array(transcriptTurnSchema).default([]),
  transcriptSummary: z.string().nullish(),
});

export const agentRouter = factory.createApp().post("/report", async (c) => {
  const secret = c.req.header("X-Agent-Secret");
  const expectedSecret = process.env.AGENT_CALLBACK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = reportPayloadSchema.safeParse(await c.req.json());

  if (!body.success) {
    return c.json({ details: body.error.flatten(), error: "Invalid payload" }, 400);
  }

  const { data } = body;
  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Upsert interviewConversation
    await tx
      .insert(interviewConversation)
      .values({
        agentId: data.agentId ?? null,
        callSuccessful: data.callSuccessful ?? null,
        conversationId: data.conversationId,
        dataCollectionResults: {},
        dynamicVariables: {},
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        evaluationCriteriaResults: data.evaluationCriteriaResults ?? {},
        interviewRecordId: data.interviewRecordId,
        lastSyncedAt: now,
        metadata: data.metadata ?? {},
        mode: "voice",
        scheduleEntryId: data.scheduleEntryId,
        startedAt: data.startedAt ? new Date(data.startedAt) : null,
        status: data.status,
        transcript: data.transcript,
        transcriptSummary: data.transcriptSummary ?? null,
        webhookReceivedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          callSuccessful: data.callSuccessful ?? null,
          endedAt: data.endedAt ? new Date(data.endedAt) : null,
          evaluationCriteriaResults: data.evaluationCriteriaResults ?? {},
          lastSyncedAt: now,
          metadata: data.metadata ?? {},
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
          status: data.status,
          transcript: data.transcript,
          transcriptSummary: data.transcriptSummary ?? null,
          webhookReceivedAt: now,
        },
        target: interviewConversation.conversationId,
      });

    // 2. Delete old turns + batch insert new ones
    await tx
      .delete(interviewConversationTurn)
      .where(eq(interviewConversationTurn.conversationId, data.conversationId));

    if (data.transcript.length > 0) {
      const callStart = data.startedAt ? new Date(data.startedAt) : now;

      await tx.insert(interviewConversationTurn).values(
        data.transcript.map((turn, index) => ({
          conversationId: data.conversationId,
          createdAt: new Date(callStart.getTime() + (turn.timeInCallSecs ?? 0) * 1000),
          id: `${data.conversationId}:turn:${index}`,
          interviewRecordId: data.interviewRecordId,
          message: turn.message,
          receivedAt: now,
          role: turn.role,
          source: "agent_report" as const,
          timeInCallSecs:
            turn.timeInCallSecs === null || turn.timeInCallSecs === undefined
              ? null
              : Math.round(turn.timeInCallSecs),
        })),
      );
    }

    // 3. Update schedule entry
    await tx
      .update(studioInterviewSchedule)
      .set({
        conversationId: data.conversationId,
        status: "completed" as const,
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
          ne(studioInterviewSchedule.status, "completed"),
        ),
      );

    if (pendingRounds.length === 0) {
      await tx
        .update(studioInterview)
        .set({ status: "completed" as const, updatedAt: now })
        .where(eq(studioInterview.id, data.interviewRecordId));
    }

    // 5. Audit log
    await tx.insert(interviewAuditLog).values({
      action: "agent_report_received",
      createdAt: now,
      detail: {
        callSuccessful: data.callSuccessful,
        conversationId: data.conversationId,
        turnCount: data.transcript.length,
      },
      id: crypto.randomUUID(),
      interviewRecordId: data.interviewRecordId,
      operatorId: null,
      scheduleEntryId: data.scheduleEntryId,
    });
  });

  // 6. Invalidate caches
  safeUpdateTag("studio-interviews");
  safeUpdateTag("interview-conversations");
  safeUpdateTag(`interview-conversations-${data.interviewRecordId}`);

  return c.json({ conversationId: data.conversationId, success: true }, 201);
});
