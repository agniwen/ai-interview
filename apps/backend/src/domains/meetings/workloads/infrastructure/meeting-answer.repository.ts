import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import {
  meetingAccessGrant,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingSession,
  meetingTranscriptTurn,
  member,
} from "@arc/db-schema/schema";
import {
  materializeMeetingAnswer,
  meetingAnswerModelOutputSchema,
  meetingAnswerPayloadSchema,
  MeetingAnswerTerminalError,
} from "@arc/shared/meeting-answer";
import { meetingIntelligencePayloadSchema } from "@arc/shared/meeting-intelligence";
import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type {
  MeetingAnswerGenerationContext,
  MeetingAnswerProcessorPorts,
} from "../meeting-answer.processor.js";

const ANSWER_LEASE_MS = 5 * 60 * 1000;
const MAX_NOTES = 200;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function modelName(env: NodeJS.ProcessEnv): string {
  return (
    env.MASTRA_STRUCTURED_MODEL?.trim() ||
    env.ALIBABA_STRUCTURED_MODEL?.trim() ||
    env.MASTRA_CHAT_MODEL?.trim() ||
    env.ALIBABA_MODEL?.trim() ||
    "deepseek-v4-flash-0731"
  );
}

async function meetingAccess(
  tx: Transaction,
  input: { meetingId: string; organizationId: string; userId: string },
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
  if (!meeting || ["trashed", "purging"].includes(meeting.status)) {
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
  const administrator = membership.role === "owner" || membership.role === "admin";
  const controller = (meeting.custodianId ?? meeting.ownerId) === input.userId;
  return administrator || controller || meeting.visibility === "workspace" || grant
    ? meeting
    : null;
}

export class MeetingAnswerInfrastructure implements MeetingAnswerProcessorPorts {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;
  private readonly tokenFactory = randomUUID;

  constructor(database: Database, env: NodeJS.ProcessEnv = rawBackendEnvironment) {
    this.database = database;
    this.env = env;
  }

  createExecutionToken(): string {
    return this.tokenFactory();
  }

  generatorSnapshot() {
    return { model: `alibaba/${modelName(this.env)}`, provider: "mastra" };
  }

  async claim(input: { attempt: number; exchangeId: string; executionToken: string }) {
    const candidate = await this.database.query.meetingQuestionExchange.findFirst({
      where: { id: input.exchangeId },
    });
    if (!candidate) {
      return { status: "not-current" as const };
    }
    return this.database.transaction(async (tx) => {
      const meeting = await meetingAccess(tx, {
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
        return { status: "not-current" as const };
      }
      if (!meeting) {
        await tx
          .update(meetingQuestionExchange)
          .set({ errorCode: "access-revoked", executionToken: null, status: "failed" })
          .where(eq(meetingQuestionExchange.id, exchange.id));
        return { status: "not-authorized" as const };
      }
      if (exchange.status === "ready") {
        return { status: "already-ready" as const };
      }
      if (exchange.status === "failed") {
        return { status: "not-current" as const };
      }
      if (
        exchange.status === "processing" &&
        exchange.executionToken &&
        exchange.leaseExpiresAt &&
        exchange.leaseExpiresAt > new Date()
      ) {
        return { status: "busy" as const };
      }
      if (!meeting.activeTranscriptRevisionId) {
        return { status: "not-current" as const };
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
        model: exchange.model,
        promptVersion: exchange.promptVersion,
        provider: exchange.provider,
        question: exchange.question,
        status: "claimed" as const,
      };
    });
  }

  loadContext(input: {
    exchangeId: string;
    executionToken: string;
  }): Promise<MeetingAnswerGenerationContext | null> {
    return this.database.transaction(async (tx) => {
      const exchange = await tx.query.meetingQuestionExchange.findFirst({
        where: { executionToken: input.executionToken, id: input.exchangeId, status: "processing" },
      });
      if (
        !exchange ||
        !(await meetingAccess(tx, {
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
          limit: MAX_NOTES,
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

  async generate(input: MeetingAnswerGenerationContext & { question: string }) {
    const selectedTurns = input.turns.slice(-24).map((turn) => ({
      ...turn,
      text: turn.text.slice(0, 1500),
    }));
    const apiKey = this.env.ALIBABA_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ALIBABA_API_KEY is required for Meeting Answer");
    }
    const client = new OpenAI({
      apiKey,
      baseURL:
        this.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    const response = await client.chat.completions.create({
      max_tokens: 3000,
      messages: [
        {
          content:
            "只根据给定会议 transcript 回答。JSON 输出必须符合：{kind:'answer'|'insufficient-evidence',text:string,citationTurnIds:string[]}；事实回答至少引用一个实际 turn id，证据不足时不得猜测。",
          role: "system",
        },
        {
          content: JSON.stringify({
            intelligence: input.intelligence,
            notes: input.notes.slice(-10),
            previous: input.previous.slice(-5),
            question: input.question,
            transcript: selectedTurns,
          }),
          role: "user",
        },
      ],
      model: modelName(this.env),
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("Meeting Answer provider returned an empty response");
    }
    try {
      return materializeMeetingAnswer(
        meetingAnswerModelOutputSchema.parse(JSON.parse(content)),
        selectedTurns,
      );
    } catch {
      throw new MeetingAnswerTerminalError("Meeting Answer 结构化输出或 citation 无效");
    }
  }

  async publish(input: {
    answer: ReturnType<typeof meetingAnswerPayloadSchema.parse>;
    exchangeId: string;
    executionToken: string;
  }): Promise<boolean> {
    const answer = meetingAnswerPayloadSchema.parse(input.answer);
    const candidate = await this.database.query.meetingQuestionExchange.findFirst({
      where: { id: input.exchangeId },
    });
    if (!candidate) {
      return false;
    }
    return this.database.transaction(async (tx) => {
      const meeting = await meetingAccess(tx, {
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

  async markFailed(input: {
    exchangeId: string;
    executionToken: string;
    terminal: boolean;
  }): Promise<boolean> {
    const [updated] = await this.database
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
}
