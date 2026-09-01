import { and, asc, desc, eq, lt, lte, or } from "drizzle-orm";
import {
  meetingAccessGrant,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingSession,
  meetingTranscriptTurn,
  member,
} from "@arc/db-schema/schema";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import { meetingAnswerPayloadSchema } from "@arc/shared/meeting-answer";
import type { MeetingAnswerPayload } from "@arc/shared/meeting-answer";
import { meetingIntelligencePayloadSchema } from "@arc/shared/meeting-intelligence";
import { db } from "../db";

const ANSWER_LEASE_MS = 5 * 60 * 1000;
const MAX_RETRIEVAL_NOTES = 200;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function hasMeetingAccess(
  tx: Transaction,
  input: {
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
    .for("share")
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

export type MeetingAnswerClaim =
  | { status: "already-ready" | "busy" | "not-authorized" | "not-current" }
  | {
      exchangeId: string;
      inputIntelligenceRevisionId: string | null;
      inputTranscriptRevisionId: string;
      meetingId: string;
      model: string;
      organizationId: string;
      promptVersion: string;
      provider: string;
      question: string;
      sequence: number;
      status: "claimed";
      threadId: string;
    };

export async function claimMeetingAnswerExchange(input: {
  attempt: number;
  exchangeId: string;
  executionToken: string;
}): Promise<MeetingAnswerClaim> {
  const candidate = await db.query.meetingQuestionExchange.findFirst({
    where: { id: input.exchangeId },
  });
  if (!candidate) {
    return { status: "not-current" };
  }
  return await db.transaction(async (tx) => {
    const meeting = await hasMeetingAccess(tx, {
      meetingId: candidate.meetingId,
      organizationId: candidate.organizationId,
      userId: candidate.createdBy,
    });
    const [exchange] = await tx
      .select()
      .from(meetingQuestionExchange)
      .where(eq(meetingQuestionExchange.id, input.exchangeId))
      .for("update")
      .limit(1);
    if (!exchange) {
      return { status: "not-current" };
    }
    if (!meeting) {
      await tx
        .update(meetingQuestionExchange)
        .set({ errorCode: "access-revoked", executionToken: null, status: "failed" })
        .where(eq(meetingQuestionExchange.id, exchange.id));
      return { status: "not-authorized" };
    }
    if (exchange.status === "ready") {
      return { status: "already-ready" };
    }
    if (exchange.status === "failed") {
      return { status: "not-current" };
    }
    if (
      exchange.status === "processing" &&
      exchange.executionToken &&
      exchange.leaseExpiresAt &&
      exchange.leaseExpiresAt.getTime() > Date.now()
    ) {
      return { status: "busy" };
    }
    if (!meeting.activeTranscriptRevisionId) {
      return { status: "not-current" };
    }
    await tx
      .update(meetingQuestionExchange)
      .set({
        attempt: input.attempt,
        errorCode: null,
        executionToken: input.executionToken,
        inputIntelligenceRevisionId: meeting.activeIntelligenceRevisionId,
        inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
        leaseExpiresAt: new Date(Date.now() + ANSWER_LEASE_MS),
        status: "processing",
      })
      .where(eq(meetingQuestionExchange.id, exchange.id));
    return {
      exchangeId: exchange.id,
      inputIntelligenceRevisionId: meeting.activeIntelligenceRevisionId,
      inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
      meetingId: exchange.meetingId,
      model: exchange.model,
      organizationId: exchange.organizationId,
      promptVersion: exchange.promptVersion,
      provider: exchange.provider,
      question: exchange.question,
      sequence: exchange.sequence,
      status: "claimed",
      threadId: exchange.threadId,
    };
  });
}

export async function loadMeetingAnswerContext(input: {
  exchangeId: string;
  executionToken: string;
}) {
  return await db.transaction(async (tx) => {
    const exchange = await tx.query.meetingQuestionExchange.findFirst({
      where: { executionToken: input.executionToken, id: input.exchangeId, status: "processing" },
    });
    if (
      !exchange ||
      !(await hasMeetingAccess(tx, {
        meetingId: exchange.meetingId,
        organizationId: exchange.organizationId,
        userId: exchange.createdBy,
      }))
    ) {
      return null;
    }
    const [turns, notes, intelligence, previous] = await Promise.all([
      tx.query.meetingTranscriptTurn.findMany({
        orderBy: { sequence: "asc" },
        where: { revisionId: exchange.inputTranscriptRevisionId },
      }),
      tx.query.meetingNote.findMany({
        limit: MAX_RETRIEVAL_NOTES,
        orderBy: { updatedAt: "desc" },
        where: { meetingId: exchange.meetingId, organizationId: exchange.organizationId },
      }),
      exchange.inputIntelligenceRevisionId
        ? tx.query.meetingIntelligenceRevision.findFirst({
            where: {
              id: exchange.inputIntelligenceRevisionId,
              meetingId: exchange.meetingId,
              organizationId: exchange.organizationId,
            },
          })
        : null,
      tx
        .select()
        .from(meetingQuestionExchange)
        .where(
          and(
            eq(meetingQuestionExchange.createdBy, exchange.createdBy),
            eq(
              meetingQuestionExchange.inputTranscriptRevisionId,
              exchange.inputTranscriptRevisionId,
            ),
            eq(meetingQuestionExchange.status, "ready"),
            eq(meetingQuestionExchange.threadId, exchange.threadId),
            lt(meetingQuestionExchange.sequence, exchange.sequence),
          ),
        )
        .orderBy(desc(meetingQuestionExchange.sequence))
        .limit(10),
    ]);
    return {
      intelligence: intelligence
        ? meetingIntelligencePayloadSchema.parse(intelligence.content)
        : null,
      notes: notes
        .toSorted((left, right) => left.meetingTimeMs - right.meetingTimeMs)
        .map((note) => ({ body: note.body, meetingTimeMs: note.meetingTimeMs })),
      previous: previous.toReversed().map((item) => ({
        answer: meetingAnswerPayloadSchema.parse(item.answer),
        question: item.question,
      })),
      turns: turns.map((turn) => ({
        endMs: turn.endMs,
        id: turn.id,
        speakerDisplayName: turn.speakerDisplayName,
        speakerKey: turn.speakerKey,
        startMs: turn.startMs,
        text: turn.text,
      })),
    };
  });
}

export async function publishMeetingAnswerExchange(input: {
  answer: MeetingAnswerPayload;
  exchangeId: string;
  executionToken: string;
}): Promise<boolean> {
  const answer = meetingAnswerPayloadSchema.parse(input.answer);
  const candidate = await db.query.meetingQuestionExchange.findFirst({
    where: { id: input.exchangeId },
  });
  if (!candidate) {
    return false;
  }
  return await db.transaction(async (tx) => {
    const meeting = await hasMeetingAccess(tx, {
      meetingId: candidate.meetingId,
      organizationId: candidate.organizationId,
      userId: candidate.createdBy,
    });
    const [exchange] = await tx
      .select()
      .from(meetingQuestionExchange)
      .where(eq(meetingQuestionExchange.id, input.exchangeId))
      .for("update")
      .limit(1);
    if (
      !meeting ||
      !exchange ||
      exchange.executionToken !== input.executionToken ||
      exchange.status !== "processing" ||
      meeting.activeTranscriptRevisionId !== exchange.inputTranscriptRevisionId
    ) {
      return false;
    }
    const allowedTurns = await tx
      .select({
        endMs: meetingTranscriptTurn.endMs,
        id: meetingTranscriptTurn.id,
        startMs: meetingTranscriptTurn.startMs,
      })
      .from(meetingTranscriptTurn)
      .where(eq(meetingTranscriptTurn.revisionId, exchange.inputTranscriptRevisionId));
    const byId = new Map(allowedTurns.map((turn) => [turn.id, turn]));
    if (
      answer.citations.some((citation) => {
        const turn = byId.get(citation.turnId);
        return !turn || turn.startMs !== citation.startMs || turn.endMs !== citation.endMs;
      })
    ) {
      throw new Error("Meeting Answer citation 不属于当前转录");
    }
    await tx
      .update(meetingQuestionExchange)
      .set({
        answer,
        answeredAt: new Date(),
        errorCode: null,
        executionToken: null,
        leaseExpiresAt: null,
        status: "ready",
      })
      .where(eq(meetingQuestionExchange.id, exchange.id));
    await tx
      .update(meetingQuestionThread)
      .set({ updatedAt: new Date() })
      .where(eq(meetingQuestionThread.id, exchange.threadId));
    return true;
  });
}

export async function markMeetingAnswerFailed(input: {
  exchangeId: string;
  executionToken: string;
  terminal: boolean;
}): Promise<boolean> {
  const [updated] = await db
    .update(meetingQuestionExchange)
    .set({
      errorCode: "provider-error",
      executionToken: null,
      leaseExpiresAt: null,
      status: input.terminal ? "failed" : "pending",
    })
    .where(
      and(
        eq(meetingQuestionExchange.id, input.exchangeId),
        eq(meetingQuestionExchange.executionToken, input.executionToken),
        eq(meetingQuestionExchange.status, "processing"),
      ),
    )
    .returning({ id: meetingQuestionExchange.id });
  return Boolean(updated);
}

export async function listRecoverableMeetingAnswerJobs(): Promise<MeetingAnswerJobData[]> {
  return await db
    .select({ exchangeId: meetingQuestionExchange.id })
    .from(meetingQuestionExchange)
    .where(
      or(
        eq(meetingQuestionExchange.status, "pending"),
        and(
          eq(meetingQuestionExchange.status, "processing"),
          lte(meetingQuestionExchange.leaseExpiresAt, new Date()),
        ),
      ),
    )
    .orderBy(asc(meetingQuestionExchange.createdAt), asc(meetingQuestionExchange.id))
    .limit(100);
}
