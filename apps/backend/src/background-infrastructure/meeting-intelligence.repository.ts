/* oxlint-disable complexity, require-await, anti-slop/no-object-parameters -- Durable claim/publish guards and Drizzle update values remain colocated. */
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import {
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptTurn,
} from "@arc/db-schema/schema";
import {
  MEETING_INTELLIGENCE_DECISION_POLICY_VERSION,
  MeetingIntelligenceTerminalError,
  meetingIntelligenceCheckpointSchema,
  meetingIntelligenceGenerationProgressSchema,
  meetingIntelligencePayloadSchema,
  meetingIntelligenceRunResultSchema,
  meetingIntelligenceTemplateSchema,
  validateMeetingIntelligenceEvidence,
} from "@arc/shared/meeting-intelligence";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { MeetingIntelligenceProcessorPorts } from "../background-workloads/processors/meeting-intelligence.processor.js";
import { generateMeetingIntelligence } from "./meeting-intelligence.generator.js";

const LEASE_MS = 15 * 60 * 1000;
const providerJsonObjectSchema = z.object({}).passthrough();

function model(env: NodeJS.ProcessEnv) {
  return env.MEETING_INTELLIGENCE_MODEL?.trim() || "alibaba/deepseek-v4-flash-0731";
}

export class MeetingIntelligenceInfrastructure implements MeetingIntelligenceProcessorPorts {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;
  private readonly tokenFactory = randomUUID;

  constructor(database: Database, env: NodeJS.ProcessEnv = process.env) {
    this.database = database;
    this.env = env;
  }

  createExecutionToken() {
    return this.tokenFactory();
  }

  generatorSnapshot() {
    const identifier = model(this.env);
    return { model: identifier, provider: identifier.split("/", 1)[0] || "unknown" };
  }

  async claim(input: { attempt: number; executionToken: string; processingRunId: string }) {
    const candidate = await this.database.query.meetingProcessingRun.findFirst({
      where: { id: input.processingRunId, stage: "meeting-intelligence" },
    });
    if (!candidate) {
      return { status: "not-current" as const };
    }
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          intelligenceRunId: meetingSession.intelligenceRunId,
          status: meetingSession.status,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, candidate.meetingId),
            eq(meetingSession.organizationId, candidate.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      const [run] = await tx
        .select()
        .from(meetingProcessingRun)
        .where(eq(meetingProcessingRun.id, input.processingRunId))
        .for("update")
        .limit(1);
      if (!run || run.stage !== "meeting-intelligence") {
        return { status: "not-current" as const };
      }
      if (run.status === "succeeded") {
        return { status: "already-ready" as const };
      }
      if (
        !meeting ||
        meeting.status !== "ready" ||
        meeting.intelligenceRunId !== run.id ||
        meeting.activeTranscriptRevisionId !== run.inputTranscriptRevisionId ||
        run.status === "failed" ||
        !run.inputTranscriptRevisionId ||
        !run.promptVersion ||
        !run.templateKey
      ) {
        return { status: "not-current" as const };
      }
      if (
        run.status === "processing" &&
        run.executionToken &&
        Date.now() - run.startedAt.getTime() < LEASE_MS
      ) {
        return { status: "busy" as const };
      }
      await tx
        .update(meetingProcessingRun)
        .set({
          attempt: input.attempt,
          errorCode: null,
          errorMessage: null,
          executionToken: input.executionToken,
          finishedAt: null,
          startedAt: new Date(),
          status: "processing",
        })
        .where(eq(meetingProcessingRun.id, run.id));
      await tx
        .update(meetingSession)
        .set({ intelligenceError: null, intelligenceStatus: "processing" })
        .where(eq(meetingSession.id, run.meetingId));
      const parsed = run.result ? meetingIntelligenceRunResultSchema.safeParse(run.result) : null;
      const result = parsed?.success ? parsed.data : null;
      return {
        checkpoint: result && "content" in result ? result.content : null,
        checkpointInvalid: parsed ? !parsed.success : false,
        meetingId: run.meetingId,
        model: run.model,
        organizationId: run.organizationId,
        progress: result && "kind" in result ? result : null,
        promptVersion: run.promptVersion,
        provider: run.provider,
        status: "claimed" as const,
        template: meetingIntelligenceTemplateSchema.parse(run.templateKey),
        transcriptRevisionId: run.inputTranscriptRevisionId,
      };
    });
  }

  async loadTranscript(input: {
    meetingId: string;
    organizationId: string;
    transcriptRevisionId: string;
  }) {
    return this.database.query.meetingTranscriptRevision.findFirst({
      where: {
        id: input.transcriptRevisionId,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      },
      with: { turns: { orderBy: { sequence: "asc" } } },
    });
  }

  async generate(
    input: Parameters<MeetingIntelligenceProcessorPorts["generate"]>[0],
    runtime: Parameters<MeetingIntelligenceProcessorPorts["generate"]>[1],
  ) {
    const apiKey = this.env.ALIBABA_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ALIBABA_API_KEY is required for Meeting Intelligence");
    }
    const client = new OpenAI({
      apiKey,
      baseURL: this.env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    return generateMeetingIntelligence(
      input,
      {
        generate: async ({ maxOutputTokens, prompt, purpose }) => {
          const response = await client.chat.completions.create({
            max_tokens: maxOutputTokens,
            messages: [
              {
                content:
                  purpose === "payload"
                    ? "只输出符合 Meeting Intelligence schema 的 JSON 对象，不要 Markdown 代码围栏。"
                    : "只输出 {classification,reason} JSON 对象。",
                role: "system",
              },
              { content: prompt, role: "user" },
            ],
            model: model(this.env).split("/").at(-1) || model(this.env),
            response_format: { type: "json_object" },
            temperature: purpose === "payload" ? 0.1 : 0,
          });
          const content = response.choices[0]?.message.content;
          if (!content) {
            throw new Error("Meeting Intelligence provider returned empty response");
          }
          return providerJsonObjectSchema.parse(JSON.parse(content));
        },
      },
      runtime,
    );
  }

  heartbeat(input: { executionToken: string; processingRunId: string }) {
    return this.touch(input, { startedAt: new Date() });
  }

  saveProgress(input: Parameters<MeetingIntelligenceProcessorPorts["saveProgress"]>[0]) {
    return this.touch(input, {
      result: meetingIntelligenceGenerationProgressSchema.parse(input.progress),
      startedAt: new Date(),
    });
  }

  saveCheckpoint(input: Parameters<MeetingIntelligenceProcessorPorts["saveCheckpoint"]>[0]) {
    const content = meetingIntelligencePayloadSchema.parse(input.content);
    return this.touch(
      input,
      {
        result: meetingIntelligenceCheckpointSchema.parse({
          content,
          decisionPolicy: {
            classification: "allowed",
            version: MEETING_INTELLIGENCE_DECISION_POLICY_VERSION,
          },
        }),
        startedAt: new Date(),
      },
      content.template,
    );
  }

  private async touch(
    input: { executionToken: string; processingRunId: string },
    values: object,
    template?: string,
  ) {
    const [updated] = await this.database
      .update(meetingProcessingRun)
      .set(values)
      .where(
        and(
          eq(meetingProcessingRun.id, input.processingRunId),
          eq(meetingProcessingRun.executionToken, input.executionToken),
          eq(meetingProcessingRun.stage, "meeting-intelligence"),
          eq(meetingProcessingRun.status, "processing"),
          template ? eq(meetingProcessingRun.templateKey, template) : undefined,
        ),
      )
      .returning({ id: meetingProcessingRun.id });
    return Boolean(updated);
  }

  async publish(input: { executionToken: string; processingRunId: string }): Promise<boolean> {
    const candidate = await this.database.query.meetingProcessingRun.findFirst({
      where: { id: input.processingRunId, stage: "meeting-intelligence" },
    });
    if (!candidate) {
      return false;
    }
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select()
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, candidate.meetingId),
            eq(meetingSession.organizationId, candidate.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      const [run] = await tx
        .select()
        .from(meetingProcessingRun)
        .where(eq(meetingProcessingRun.id, input.processingRunId))
        .for("update")
        .limit(1);
      if (!run) {
        return false;
      }
      const [existing] = await tx
        .select({ id: meetingIntelligenceRevision.id })
        .from(meetingIntelligenceRevision)
        .where(eq(meetingIntelligenceRevision.processingRunId, run.id))
        .limit(1);
      if (existing && run.status === "succeeded") {
        return true;
      }
      if (
        !meeting ||
        meeting.status !== "ready" ||
        meeting.intelligenceRunId !== run.id ||
        meeting.activeTranscriptRevisionId !== run.inputTranscriptRevisionId ||
        run.executionToken !== input.executionToken ||
        run.status !== "processing" ||
        !run.inputTranscriptRevisionId ||
        !run.promptVersion ||
        !run.templateKey ||
        !run.result
      ) {
        return false;
      }
      const { content } = meetingIntelligenceCheckpointSchema.parse(run.result);
      if (content.template !== run.templateKey) {
        return false;
      }
      const turns = await tx
        .select({ id: meetingTranscriptTurn.id })
        .from(meetingTranscriptTurn)
        .where(eq(meetingTranscriptTurn.revisionId, run.inputTranscriptRevisionId));
      if (!validateMeetingIntelligenceEvidence(content, new Set(turns.map((turn) => turn.id)))) {
        throw new MeetingIntelligenceTerminalError(
          "Meeting Intelligence evidence 不属于输入转录版本",
        );
      }
      const [latest] = await tx
        .select({ revision: max(meetingIntelligenceRevision.revision) })
        .from(meetingIntelligenceRevision)
        .where(eq(meetingIntelligenceRevision.meetingId, run.meetingId));
      const revisionId = randomUUID();
      await tx.insert(meetingIntelligenceRevision).values({
        content,
        createdBy: run.requestedBy,
        id: revisionId,
        meetingId: run.meetingId,
        model: run.model,
        organizationId: run.organizationId,
        processingRunId: run.id,
        promptVersion: run.promptVersion,
        provider: run.provider,
        revision: Number(latest?.revision ?? 0) + 1,
        templateKey: run.templateKey,
        transcriptRevisionId: run.inputTranscriptRevisionId,
      });
      await tx
        .update(meetingSession)
        .set({
          activeIntelligenceRevisionId: revisionId,
          intelligenceError: null,
          intelligenceRunId: null,
          intelligenceStatus: "ready",
        })
        .where(eq(meetingSession.id, run.meetingId));
      await tx
        .update(meetingProcessingRun)
        .set({ executionToken: null, finishedAt: new Date(), status: "succeeded" })
        .where(eq(meetingProcessingRun.id, run.id));
      await tx.insert(meetingAuditLog).values({
        action: "meeting.intelligence_generated",
        actorId: run.requestedBy,
        detail: {
          revisionId,
          template: run.templateKey,
          transcriptRevisionId: run.inputTranscriptRevisionId,
        },
        id: randomUUID(),
        meetingId: run.meetingId,
        organizationId: run.organizationId,
      });
      return true;
    });
  }

  async markFailed(
    input: Parameters<MeetingIntelligenceProcessorPorts["markFailed"]>[0],
  ): Promise<boolean> {
    const candidate = await this.database.query.meetingProcessingRun.findFirst({
      where: { id: input.processingRunId, stage: "meeting-intelligence" },
    });
    if (!candidate) {
      return false;
    }
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          intelligenceRunId: meetingSession.intelligenceRunId,
          status: meetingSession.status,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, candidate.meetingId),
            eq(meetingSession.organizationId, candidate.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      const [run] = await tx
        .select()
        .from(meetingProcessingRun)
        .where(eq(meetingProcessingRun.id, input.processingRunId))
        .for("update")
        .limit(1);
      if (
        !meeting ||
        meeting.status !== "ready" ||
        meeting.intelligenceRunId !== input.processingRunId ||
        run?.executionToken !== input.executionToken ||
        run.status !== "processing"
      ) {
        return false;
      }
      await tx
        .update(meetingProcessingRun)
        .set({
          errorCode: "provider-error",
          errorMessage: input.errorMessage.slice(0, 1000),
          executionToken: null,
          finishedAt: input.terminal ? new Date() : null,
          status: input.terminal ? "failed" : "pending",
        })
        .where(eq(meetingProcessingRun.id, run.id));
      await tx
        .update(meetingSession)
        .set({
          intelligenceError: input.terminal ? "Meeting Intelligence 生成失败，请稍后重试。" : null,
          intelligenceRunId: input.terminal ? null : run.id,
          intelligenceStatus: input.terminal ? "failed" : "processing",
        })
        .where(eq(meetingSession.id, run.meetingId));
      return true;
    });
  }
}
