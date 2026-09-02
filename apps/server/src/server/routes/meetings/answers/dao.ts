import { and, asc, count, desc, eq, gte, inArray, max } from "drizzle-orm";
import { db } from "../../../../lib/server/db/index";
import {
  meetingAccessGrant,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingSession,
  member,
} from "@app/db-schema/schema";
import type {
  MeetingQuestionExchange,
  MeetingQuestionThread,
  MeetingQuestionThreadSummary,
} from "@app/shared/meeting-answer";
import {
  MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD,
  MEETING_ANSWER_MAX_THREADS_PER_MEETING,
  meetingAnswerPayloadSchema,
  meetingQuestionStatusSchema,
} from "@app/shared/meeting-answer";

const PUBLIC_ANSWER_FAILURE = "回答生成失败，请稍后重新提问。";
const MAX_ACTIVE_QUESTIONS_PER_USER = 3;
const MAX_QUESTIONS_PER_MINUTE = 10;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function hasMeetingAccess(
  tx: Transaction,
  input: {
    lockMemberForUpdate?: boolean;
    meetingId: string;
    organizationId: string;
    userId: string;
  },
) {
  const [meeting] = await tx
    .select({
      activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
      activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
      custodianId: meetingSession.custodianId,
      ownerId: meetingSession.ownerId,
      status: meetingSession.status,
      visibility: meetingSession.visibility,
    })
    .from(meetingSession)
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
      ),
    )
    .for("share")
    .limit(1);
  if (!meeting || meeting.status === "trashed" || meeting.status === "purging") {
    return null;
  }
  const [membership] = await tx
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
    .for(input.lockMemberForUpdate ? "update" : "share")
    .limit(1);
  if (!membership) {
    return null;
  }
  const [grant] = await tx
    .select({ role: meetingAccessGrant.role })
    .from(meetingAccessGrant)
    .where(
      and(
        eq(meetingAccessGrant.meetingId, input.meetingId),
        eq(meetingAccessGrant.memberId, membership.id),
      ),
    )
    .for("share")
    .limit(1);
  const isAdministrator = membership.role === "owner" || membership.role === "admin";
  const isController = (meeting.custodianId ?? meeting.ownerId) === input.userId;
  return isAdministrator || isController || meeting.visibility === "workspace" || grant
    ? meeting
    : null;
}

function serializeExchange(
  row: typeof meetingQuestionExchange.$inferSelect,
): MeetingQuestionExchange {
  return {
    answer: row.answer ? meetingAnswerPayloadSchema.parse(row.answer) : null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    error: row.status === "failed" ? PUBLIC_ANSWER_FAILURE : null,
    id: row.id,
    question: row.question,
    requestId: row.requestId,
    sequence: row.sequence,
    status: meetingQuestionStatusSchema.parse(row.status),
  };
}

function serializeThread(
  row: typeof meetingQuestionThread.$inferSelect,
): MeetingQuestionThreadSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createMeetingQuestionThread(input: {
  createdBy: string;
  meetingId: string;
  organizationId: string;
  title: string;
}): Promise<MeetingQuestionThreadSummary | "limit-reached" | null> {
  return await db.transaction(async (tx) => {
    const meeting = await hasMeetingAccess(tx, {
      lockMemberForUpdate: true,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      userId: input.createdBy,
    });
    if (!meeting) {
      return null;
    }
    const [existing] = await tx
      .select({ value: count() })
      .from(meetingQuestionThread)
      .where(
        and(
          eq(meetingQuestionThread.meetingId, input.meetingId),
          eq(meetingQuestionThread.organizationId, input.organizationId),
          eq(meetingQuestionThread.createdBy, input.createdBy),
        ),
      );
    if (Number(existing?.value ?? 0) >= MEETING_ANSWER_MAX_THREADS_PER_MEETING) {
      return "limit-reached";
    }
    const [created] = await tx
      .insert(meetingQuestionThread)
      .values({
        createdBy: input.createdBy,
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        title: input.title,
      })
      .returning();
    if (!created) {
      throw new Error("创建 Meeting Question thread 失败");
    }
    return serializeThread(created);
  });
}

export async function listMeetingQuestionThreads(input: {
  createdBy: string;
  meetingId: string;
  organizationId: string;
}): Promise<MeetingQuestionThreadSummary[] | null> {
  return await db.transaction(async (tx) => {
    if (
      !(await hasMeetingAccess(tx, {
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        userId: input.createdBy,
      }))
    ) {
      return null;
    }
    const rows = await tx
      .select()
      .from(meetingQuestionThread)
      .where(
        and(
          eq(meetingQuestionThread.meetingId, input.meetingId),
          eq(meetingQuestionThread.organizationId, input.organizationId),
          eq(meetingQuestionThread.createdBy, input.createdBy),
        ),
      )
      .orderBy(desc(meetingQuestionThread.updatedAt), desc(meetingQuestionThread.id))
      .limit(MEETING_ANSWER_MAX_THREADS_PER_MEETING);
    return rows.map(serializeThread);
  });
}

export async function loadMeetingQuestionThread(input: {
  createdBy: string;
  meetingId: string;
  organizationId: string;
  threadId: string;
}): Promise<MeetingQuestionThread | null> {
  return await db.transaction(async (tx) => {
    if (
      !(await hasMeetingAccess(tx, {
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        userId: input.createdBy,
      }))
    ) {
      return null;
    }
    const [thread] = await tx
      .select()
      .from(meetingQuestionThread)
      .where(
        and(
          eq(meetingQuestionThread.id, input.threadId),
          eq(meetingQuestionThread.meetingId, input.meetingId),
          eq(meetingQuestionThread.organizationId, input.organizationId),
          eq(meetingQuestionThread.createdBy, input.createdBy),
        ),
      )
      .limit(1);
    if (!thread) {
      return null;
    }
    const exchanges = await tx
      .select()
      .from(meetingQuestionExchange)
      .where(eq(meetingQuestionExchange.threadId, thread.id))
      .orderBy(asc(meetingQuestionExchange.sequence))
      .limit(MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD);
    return {
      ...serializeThread(thread),
      exchanges: exchanges.map(serializeExchange),
      meetingId: thread.meetingId,
    };
  });
}

export type CreateMeetingAnswerExchangeResult =
  | MeetingQuestionExchange
  | "active-question"
  | "conflict"
  | "not-authorized"
  | "not-ready"
  | "rate-limited"
  | "thread-limit";

export async function createMeetingAnswerExchange(input: {
  createdBy: string;
  meetingId: string;
  model: string;
  organizationId: string;
  promptVersion: string;
  provider: string;
  question: string;
  requestId: string;
  threadId: string;
}): Promise<CreateMeetingAnswerExchangeResult> {
  return await db.transaction(async (tx) => {
    const meeting = await hasMeetingAccess(tx, {
      lockMemberForUpdate: true,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      userId: input.createdBy,
    });
    if (!meeting) {
      return "not-authorized";
    }
    if (!(meeting.activeTranscriptRevisionId && meeting.status === "ready")) {
      return "not-ready";
    }
    const [thread] = await tx
      .select({ id: meetingQuestionThread.id })
      .from(meetingQuestionThread)
      .where(
        and(
          eq(meetingQuestionThread.id, input.threadId),
          eq(meetingQuestionThread.meetingId, input.meetingId),
          eq(meetingQuestionThread.organizationId, input.organizationId),
          eq(meetingQuestionThread.createdBy, input.createdBy),
        ),
      )
      .for("update")
      .limit(1);
    if (!thread) {
      return "not-authorized";
    }
    const [existing] = await tx
      .select()
      .from(meetingQuestionExchange)
      .where(
        and(
          eq(meetingQuestionExchange.threadId, input.threadId),
          eq(meetingQuestionExchange.requestId, input.requestId),
        ),
      )
      .limit(1);
    if (existing) {
      return existing.question === input.question ? serializeExchange(existing) : "conflict";
    }
    const [activeInThread] = await tx
      .select({ id: meetingQuestionExchange.id })
      .from(meetingQuestionExchange)
      .where(
        and(
          eq(meetingQuestionExchange.threadId, input.threadId),
          inArray(meetingQuestionExchange.status, ["pending", "processing"]),
        ),
      )
      .limit(1);
    if (activeInThread) {
      return "active-question";
    }
    const [activeForUser] = await tx
      .select({ value: count() })
      .from(meetingQuestionExchange)
      .where(
        and(
          eq(meetingQuestionExchange.organizationId, input.organizationId),
          eq(meetingQuestionExchange.createdBy, input.createdBy),
          inArray(meetingQuestionExchange.status, ["pending", "processing"]),
        ),
      );
    if (Number(activeForUser?.value ?? 0) >= MAX_ACTIVE_QUESTIONS_PER_USER) {
      return "rate-limited";
    }
    const [recentForUser] = await tx
      .select({ value: count() })
      .from(meetingQuestionExchange)
      .where(
        and(
          eq(meetingQuestionExchange.organizationId, input.organizationId),
          eq(meetingQuestionExchange.createdBy, input.createdBy),
          gte(meetingQuestionExchange.createdAt, new Date(Date.now() - 60_000)),
        ),
      );
    if (Number(recentForUser?.value ?? 0) >= MAX_QUESTIONS_PER_MINUTE) {
      return "rate-limited";
    }
    const [latest] = await tx
      .select({ sequence: max(meetingQuestionExchange.sequence) })
      .from(meetingQuestionExchange)
      .where(eq(meetingQuestionExchange.threadId, input.threadId));
    if (Number(latest?.sequence ?? 0) >= MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD) {
      return "thread-limit";
    }
    const [created] = await tx
      .insert(meetingQuestionExchange)
      .values({
        createdBy: input.createdBy,
        id: crypto.randomUUID(),
        inputIntelligenceRevisionId: meeting.activeIntelligenceRevisionId,
        inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
        meetingId: input.meetingId,
        model: input.model,
        organizationId: input.organizationId,
        promptVersion: input.promptVersion,
        provider: input.provider,
        question: input.question,
        requestId: input.requestId,
        sequence: Number(latest?.sequence ?? 0) + 1,
        threadId: input.threadId,
      })
      .returning();
    if (!created) {
      throw new Error("创建 Meeting Answer exchange 失败");
    }
    await tx
      .update(meetingQuestionThread)
      .set({ updatedAt: new Date() })
      .where(eq(meetingQuestionThread.id, input.threadId));
    return serializeExchange(created);
  });
}
