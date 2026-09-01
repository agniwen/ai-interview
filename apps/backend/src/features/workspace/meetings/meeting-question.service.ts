/* oxlint-disable complexity, typescript/consistent-type-imports -- Question serialization is transactional; Nest needs MeetingCoreService at runtime. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  meetingAuditLog,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingSession,
} from "@arc/db-schema/schema";
import {
  isMeetingAnswerQueueConfigured,
  MEETING_ANSWER_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD,
  MEETING_ANSWER_MAX_THREADS_PER_MEETING,
  meetingAnswerPayloadSchema,
} from "@arc/shared/meeting-answer";
import { and, asc, count, desc, eq, gte, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import type {
  createMeetingQuestionSchema,
  createMeetingQuestionThreadSchema,
} from "./meeting.schemas.js";
import { meetingQuestionExchangeSchema } from "./meeting.schemas.js";

@Injectable()
export class MeetingQuestionService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    private readonly core: MeetingCoreService,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}
  private async required(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
  ) {
    const authorized = await this.core.authorized(organizationId, userId, memberRole, meetingId);
    if (
      !authorized ||
      authorized.meeting.status === "trashed" ||
      authorized.meeting.status === "purging"
    ) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    if (authorized.accessRole === "administrator") {
      await this.database.insert(meetingAuditLog).values({
        action: "meeting.questions_accessed",
        actorId: userId,
        id: randomUUID(),
        meetingId,
        organizationId,
      });
    }
    return authorized;
  }
  private summary(row: typeof meetingQuestionThread.$inferSelect) {
    return {
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private exchange(row: typeof meetingQuestionExchange.$inferSelect) {
    return {
      answer: row.answer ? meetingAnswerPayloadSchema.parse(row.answer) : null,
      answeredAt: row.answeredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      error: row.status === "failed" ? "回答生成失败，请稍后重新提问。" : null,
      id: row.id,
      question: row.question,
      requestId: row.requestId,
      sequence: row.sequence,
      // SAFETY: meeting question exchanges persist only the four states exposed by this DTO.
      status: row.status as "pending" | "processing" | "ready" | "failed",
    };
  }
  async list(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    await this.required(organizationId, userId, memberRole, meetingId);
    const rows = await this.database
      .select()
      .from(meetingQuestionThread)
      .where(
        and(
          eq(meetingQuestionThread.meetingId, meetingId),
          eq(meetingQuestionThread.organizationId, organizationId),
          eq(meetingQuestionThread.createdBy, userId),
        ),
      )
      .orderBy(desc(meetingQuestionThread.updatedAt), desc(meetingQuestionThread.id))
      .limit(MEETING_ANSWER_MAX_THREADS_PER_MEETING);
    return rows.map((row) => this.summary(row));
  }
  async create(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    input: z.infer<typeof createMeetingQuestionThreadSchema>,
  ) {
    await this.required(organizationId, userId, memberRole, meetingId);
    return this.database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: count() })
        .from(meetingQuestionThread)
        .where(
          and(
            eq(meetingQuestionThread.meetingId, meetingId),
            eq(meetingQuestionThread.organizationId, organizationId),
            eq(meetingQuestionThread.createdBy, userId),
          ),
        );
      if (Number(existing?.value ?? 0) >= MEETING_ANSWER_MAX_THREADS_PER_MEETING) {
        throw new ConflictException("单场会议的提问线程数量已达上限", {
          errorCode: "MEETING_QUESTION_THREAD_LIMIT",
        });
      }
      const [created] = await tx
        .insert(meetingQuestionThread)
        .values({
          createdBy: userId,
          id: randomUUID(),
          meetingId,
          organizationId,
          title: input.title?.trim() || "新提问",
        })
        .returning();
      if (!created) {
        throw new Error("创建 Meeting Question thread 失败");
      }
      return this.summary(created);
    });
  }
  async get(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    threadId: string,
  ) {
    await this.required(organizationId, userId, memberRole, meetingId);
    const thread = await this.database.query.meetingQuestionThread.findFirst({
      where: { createdBy: userId, id: threadId, meetingId, organizationId },
    });
    if (!thread) {
      throw new NotFoundException("Meeting Question thread 不存在", {
        errorCode: "MEETING_QUESTION_THREAD_NOT_FOUND",
      });
    }
    const exchanges = await this.database
      .select()
      .from(meetingQuestionExchange)
      .where(eq(meetingQuestionExchange.threadId, threadId))
      .orderBy(asc(meetingQuestionExchange.sequence))
      .limit(MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD);
    return {
      ...this.summary(thread),
      exchanges: exchanges.map((row) => this.exchange(row)),
      meetingId,
    };
  }
  async ask(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    threadId: string,
    input: z.infer<typeof createMeetingQuestionSchema>,
  ) {
    await this.required(organizationId, userId, memberRole, meetingId);
    if (!isMeetingAnswerQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("Meeting Answer 服务暂不可用", {
        errorCode: "MEETING_ANSWER_UNAVAILABLE",
      });
    }
    const model =
      rawBackendEnvironment.MEETING_ANSWER_MODEL?.trim() ||
      rawBackendEnvironment.MEETING_INTELLIGENCE_MODEL?.trim() ||
      "alibaba/deepseek-v4-flash-0731";
    const provider = model.split("/", 1)[0] || "unknown";
    const result = await this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          status: meetingSession.status,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("share")
        .limit(1);
      if (!meeting?.activeTranscriptRevisionId || meeting.status !== "ready") {
        return "not-ready" as const;
      }
      const [thread] = await tx
        .select({ id: meetingQuestionThread.id })
        .from(meetingQuestionThread)
        .where(
          and(
            eq(meetingQuestionThread.id, threadId),
            eq(meetingQuestionThread.meetingId, meetingId),
            eq(meetingQuestionThread.organizationId, organizationId),
            eq(meetingQuestionThread.createdBy, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!thread) {
        return "not-found" as const;
      }
      const existing = await tx.query.meetingQuestionExchange.findFirst({
        where: { requestId: input.requestId, threadId },
      });
      if (existing) {
        return existing.question === input.question
          ? this.exchange(existing)
          : ("conflict" as const);
      }
      if (
        await tx.query.meetingQuestionExchange.findFirst({
          columns: { id: true },
          where: { status: { in: ["pending", "processing"] }, threadId },
        })
      ) {
        return "active-question" as const;
      }
      const [active] = await tx
        .select({ value: count() })
        .from(meetingQuestionExchange)
        .where(
          and(
            eq(meetingQuestionExchange.organizationId, organizationId),
            eq(meetingQuestionExchange.createdBy, userId),
            inArray(meetingQuestionExchange.status, ["pending", "processing"]),
          ),
        );
      const [recent] = await tx
        .select({ value: count() })
        .from(meetingQuestionExchange)
        .where(
          and(
            eq(meetingQuestionExchange.organizationId, organizationId),
            eq(meetingQuestionExchange.createdBy, userId),
            gte(meetingQuestionExchange.createdAt, new Date(Date.now() - 60_000)),
          ),
        );
      if (Number(active?.value ?? 0) >= 3 || Number(recent?.value ?? 0) >= 10) {
        return "rate-limited" as const;
      }
      const [latest] = await tx
        .select({ sequence: max(meetingQuestionExchange.sequence) })
        .from(meetingQuestionExchange)
        .where(eq(meetingQuestionExchange.threadId, threadId));
      if (Number(latest?.sequence ?? 0) >= MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD) {
        return "thread-limit" as const;
      }
      const [created] = await tx
        .insert(meetingQuestionExchange)
        .values({
          createdBy: userId,
          id: randomUUID(),
          inputIntelligenceRevisionId: meeting.activeIntelligenceRevisionId,
          inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
          meetingId,
          model,
          organizationId,
          promptVersion: MEETING_ANSWER_PROMPT_VERSION,
          provider,
          question: input.question,
          requestId: input.requestId,
          sequence: Number(latest?.sequence ?? 0) + 1,
          threadId,
        })
        .returning();
      if (!created) {
        throw new Error("创建 Meeting Answer exchange 失败");
      }
      await tx
        .update(meetingQuestionThread)
        .set({ updatedAt: new Date() })
        .where(eq(meetingQuestionThread.id, threadId));
      return this.exchange(created);
    });
    const parsedStatus = z.string().safeParse(result);
    if (parsedStatus.success) {
      return parsedStatus.data;
    }
    const exchange = meetingQuestionExchangeSchema.parse(result);
    try {
      await this.queueProducer.enqueueMeetingAnswerJobs([{ exchangeId: exchange.id }]);
    } catch (error) {
      console.error("[meeting-answer] failed to enqueue exchange", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        exchangeId: exchange.id,
      });
    }
    return exchange;
  }
}
