import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, max, ne, or } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import {
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptTurn,
  member,
  user,
} from "@arc/db-schema/schema";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
  MeetingIntelligenceResult,
  MeetingIntelligenceRevision,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
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
import { z } from "zod";

const PUBLIC_INTELLIGENCE_FAILURE_MESSAGE = "Meeting Intelligence 生成失败，请稍后重试。";
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const meetingIntelligenceStateSchema = z.enum(["failed", "pending", "processing", "ready"]);

interface RequestMeetingIntelligenceRunInput {
  actorId: string | null;
  meetingId: string;
  model: string;
  organizationId: string;
  pipelineVersion: string;
  promptVersion: string;
  provider: string;
  requestKind: "automatic" | "manual";
  template: MeetingIntelligenceTemplate;
}

function automaticIdempotencyKey(
  input: RequestMeetingIntelligenceRunInput,
  transcriptRevisionId: string,
): string {
  return [
    "meeting-intelligence",
    input.meetingId,
    transcriptRevisionId,
    input.template,
    input.provider,
    input.model,
    input.pipelineVersion,
    input.promptVersion,
  ].join(":");
}

export async function requestMeetingIntelligenceRun(
  input: RequestMeetingIntelligenceRunInput,
): Promise<{ processingRunId: string } | "forbidden" | null> {
  return await db.transaction(
    // eslint-disable-next-line complexity -- authorization, idempotency, and supersession share one locked transaction.
    async (tx) => {
      const [meeting] = await tx
        .select({
          activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          custodianId: meetingSession.custodianId,
          intelligenceRunId: meetingSession.intelligenceRunId,
          ownerId: meetingSession.ownerId,
          status: meetingSession.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !meeting?.activeTranscriptRevisionId ||
        meeting.status !== "ready" ||
        meeting.transcriptionStatus !== "ready"
      ) {
        return null;
      }
      if (input.requestKind === "manual") {
        if (!input.actorId) {
          return "forbidden";
        }
        const [currentMember] = await tx
          .select({ role: member.role })
          .from(member)
          .where(
            and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)),
          )
          .for("share")
          .limit(1);
        const isController = (meeting.custodianId ?? meeting.ownerId) === input.actorId;
        const isAdministrator = currentMember?.role === "owner" || currentMember?.role === "admin";
        if (!currentMember || !(isController || isAdministrator)) {
          return "forbidden";
        }
      }

      if (meeting.intelligenceRunId) {
        const [activeRun] = await tx
          .select({
            id: meetingProcessingRun.id,
            inputTranscriptRevisionId: meetingProcessingRun.inputTranscriptRevisionId,
            model: meetingProcessingRun.model,
            pipelineVersion: meetingProcessingRun.pipelineVersion,
            promptVersion: meetingProcessingRun.promptVersion,
            provider: meetingProcessingRun.provider,
            requestKind: meetingProcessingRun.requestKind,
            status: meetingProcessingRun.status,
            templateKey: meetingProcessingRun.templateKey,
          })
          .from(meetingProcessingRun)
          .where(eq(meetingProcessingRun.id, meeting.intelligenceRunId))
          .for("update")
          .limit(1);
        if (activeRun?.status === "pending" || activeRun?.status === "processing") {
          if (
            input.requestKind === "automatic" &&
            activeRun.requestKind === "manual" &&
            activeRun.inputTranscriptRevisionId === meeting.activeTranscriptRevisionId
          ) {
            return null;
          }
          if (activeRun.status === "processing") {
            return { processingRunId: activeRun.id };
          }
          if (
            activeRun.inputTranscriptRevisionId === meeting.activeTranscriptRevisionId &&
            activeRun.templateKey === input.template &&
            activeRun.provider === input.provider &&
            activeRun.model === input.model &&
            activeRun.pipelineVersion === input.pipelineVersion &&
            activeRun.promptVersion === input.promptVersion
          ) {
            return { processingRunId: activeRun.id };
          }
        }
      }

      if (input.requestKind === "automatic" && meeting.activeIntelligenceRevisionId) {
        const [current] = await tx
          .select({
            model: meetingIntelligenceRevision.model,
            promptVersion: meetingIntelligenceRevision.promptVersion,
            provider: meetingIntelligenceRevision.provider,
            templateKey: meetingIntelligenceRevision.templateKey,
            transcriptRevisionId: meetingIntelligenceRevision.transcriptRevisionId,
          })
          .from(meetingIntelligenceRevision)
          .where(eq(meetingIntelligenceRevision.id, meeting.activeIntelligenceRevisionId))
          .limit(1);
        if (
          current?.transcriptRevisionId === meeting.activeTranscriptRevisionId &&
          current.templateKey === input.template &&
          current.provider === input.provider &&
          current.model === input.model &&
          current.promptVersion === input.promptVersion
        ) {
          return null;
        }
      }

      const idempotencyKey =
        input.requestKind === "automatic"
          ? automaticIdempotencyKey(input, meeting.activeTranscriptRevisionId)
          : `${automaticIdempotencyKey(input, meeting.activeTranscriptRevisionId)}:manual:${crypto.randomUUID()}`;
      const processingRunId = crypto.randomUUID();
      const [inserted] = await tx
        .insert(meetingProcessingRun)
        .values({
          attempt: 0,
          id: processingRunId,
          idempotencyKey,
          inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: input.pipelineVersion,
          promptVersion: input.promptVersion,
          provider: input.provider,
          region: "default",
          requestKind: input.requestKind,
          requestedBy: input.actorId,
          stage: "meeting-intelligence",
          status: "pending",
          templateKey: input.template,
        })
        .onConflictDoNothing({ target: meetingProcessingRun.idempotencyKey })
        .returning({ id: meetingProcessingRun.id });
      const existingRows = inserted?.id
        ? []
        : await tx
            .select({ id: meetingProcessingRun.id, status: meetingProcessingRun.status })
            .from(meetingProcessingRun)
            .where(eq(meetingProcessingRun.idempotencyKey, idempotencyKey))
            .limit(1);
      const existingRun = inserted?.id ? { id: inserted.id, status: "pending" } : existingRows[0];
      if (
        input.requestKind === "automatic" &&
        (existingRun?.status === "succeeded" || existingRun?.status === "failed")
      ) {
        return null;
      }
      const runId = existingRun?.id;
      if (!runId) {
        throw new Error("创建 Meeting Intelligence processing run 失败");
      }
      if (meeting.intelligenceRunId && meeting.intelligenceRunId !== runId) {
        await tx
          .update(meetingProcessingRun)
          .set({
            errorCode: "superseded",
            errorMessage: "Meeting Intelligence run was superseded",
            executionToken: null,
            finishedAt: new Date(),
            status: "failed",
          })
          .where(
            and(
              eq(meetingProcessingRun.id, meeting.intelligenceRunId),
              inArray(meetingProcessingRun.status, ["pending", "processing"]),
            ),
          );
      }
      await tx
        .update(meetingSession)
        .set({
          intelligenceError: null,
          intelligenceRunId: runId,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, input.meetingId));
      if (input.requestKind === "manual") {
        await tx.insert(meetingAuditLog).values({
          action: "meeting.intelligence_regeneration_requested",
          actorId: input.actorId,
          detail: { processingRunId: runId, template: input.template },
          id: crypto.randomUUID(),
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        });
      }
      return { processingRunId: runId };
    },
  );
}

export type MeetingIntelligenceClaim =
  | { status: "already-ready" | "busy" | "not-current" }
  | {
      checkpoint: MeetingIntelligencePayload | null;
      checkpointInvalid?: boolean;
      progress?: MeetingIntelligenceGenerationProgress | null;
      meetingId: string;
      model: string;
      organizationId: string;
      promptVersion: string;
      provider: string;
      status: "claimed";
      template: MeetingIntelligenceTemplate;
      transcriptRevisionId: string;
    };

export async function claimMeetingIntelligenceRun(input: {
  attempt: number;
  executionToken: string;
  processingRunId: string;
}): Promise<MeetingIntelligenceClaim> {
  const candidate = await db.query.meetingProcessingRun.findFirst({
    where: { id: input.processingRunId, stage: "meeting-intelligence" },
  });
  if (!candidate) {
    return { status: "not-current" };
  }
  return await db.transaction(
    // eslint-disable-next-line complexity -- claim validation and durable checkpoint decoding share one locked transition.
    async (tx) => {
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
        return { status: "not-current" };
      }
      if (run.status === "succeeded") {
        return { status: "already-ready" };
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
        return { status: "not-current" };
      }
      if (
        run.status === "processing" &&
        run.executionToken &&
        Date.now() - run.startedAt.getTime() < PROCESSING_LEASE_MS
      ) {
        return { status: "busy" };
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
      const checkpointResult = run.result
        ? meetingIntelligenceRunResultSchema.safeParse(run.result)
        : null;
      const parsedResult = checkpointResult?.success ? checkpointResult.data : null;
      return {
        checkpoint: parsedResult && "content" in parsedResult ? parsedResult.content : null,
        checkpointInvalid: checkpointResult ? !checkpointResult.success : false,
        meetingId: run.meetingId,
        model: run.model,
        organizationId: run.organizationId,
        progress: parsedResult && "kind" in parsedResult ? parsedResult : null,
        promptVersion: run.promptVersion,
        provider: run.provider,
        status: "claimed",
        template: meetingIntelligenceTemplateSchema.parse(run.templateKey),
        transcriptRevisionId: run.inputTranscriptRevisionId,
      };
    },
  );
}

export async function loadMeetingIntelligenceTranscript(input: {
  meetingId: string;
  organizationId: string;
  transcriptRevisionId: string;
}) {
  return await db.query.meetingTranscriptRevision.findFirst({
    where: {
      id: input.transcriptRevisionId,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    },
    with: { turns: { orderBy: { sequence: "asc" } } },
  });
}

export async function saveMeetingIntelligenceCheckpoint(input: {
  content: MeetingIntelligencePayload;
  executionToken: string;
  processingRunId: string;
}): Promise<boolean> {
  const content = meetingIntelligencePayloadSchema.parse(input.content);
  const checkpoint = meetingIntelligenceCheckpointSchema.parse({
    content,
    decisionPolicy: {
      classification: "allowed",
      version: MEETING_INTELLIGENCE_DECISION_POLICY_VERSION,
    },
  });
  const [updated] = await db
    .update(meetingProcessingRun)
    .set({ result: checkpoint, startedAt: new Date() })
    .where(
      and(
        eq(meetingProcessingRun.id, input.processingRunId),
        eq(meetingProcessingRun.executionToken, input.executionToken),
        eq(meetingProcessingRun.stage, "meeting-intelligence"),
        eq(meetingProcessingRun.status, "processing"),
        eq(meetingProcessingRun.templateKey, content.template),
      ),
    )
    .returning({ id: meetingProcessingRun.id });
  return Boolean(updated);
}

export async function saveMeetingIntelligenceProgress(input: {
  executionToken: string;
  processingRunId: string;
  progress: MeetingIntelligenceGenerationProgress;
}): Promise<boolean> {
  const progress = meetingIntelligenceGenerationProgressSchema.parse(input.progress);
  const [updated] = await db
    .update(meetingProcessingRun)
    .set({ result: progress, startedAt: new Date() })
    .where(
      and(
        eq(meetingProcessingRun.id, input.processingRunId),
        eq(meetingProcessingRun.executionToken, input.executionToken),
        eq(meetingProcessingRun.stage, "meeting-intelligence"),
        eq(meetingProcessingRun.status, "processing"),
      ),
    )
    .returning({ id: meetingProcessingRun.id });
  return Boolean(updated);
}

export async function heartbeatMeetingIntelligenceRun(input: {
  executionToken: string;
  processingRunId: string;
}): Promise<boolean> {
  const [updated] = await db
    .update(meetingProcessingRun)
    .set({ startedAt: new Date() })
    .where(
      and(
        eq(meetingProcessingRun.id, input.processingRunId),
        eq(meetingProcessingRun.executionToken, input.executionToken),
        eq(meetingProcessingRun.stage, "meeting-intelligence"),
        eq(meetingProcessingRun.status, "processing"),
      ),
    )
    .returning({ id: meetingProcessingRun.id });
  return Boolean(updated);
}

export async function publishMeetingIntelligence(input: {
  executionToken: string;
  processingRunId: string;
}): Promise<boolean> {
  const candidate = await db.query.meetingProcessingRun.findFirst({
    where: { id: input.processingRunId, stage: "meeting-intelligence" },
  });
  if (!candidate) {
    return false;
  }
  return await db.transaction(async (tx) => {
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
    const revisionId = crypto.randomUUID();
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
      id: crypto.randomUUID(),
      meetingId: run.meetingId,
      organizationId: run.organizationId,
    });
    return true;
  });
}

export async function markMeetingIntelligenceFailed(input: {
  errorMessage: string;
  executionToken: string;
  processingRunId: string;
  terminal: boolean;
}): Promise<boolean> {
  const candidate = await db.query.meetingProcessingRun.findFirst({
    where: { id: input.processingRunId, stage: "meeting-intelligence" },
  });
  if (!candidate) {
    return false;
  }
  return await db.transaction(async (tx) => {
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
        intelligenceError: input.terminal ? PUBLIC_INTELLIGENCE_FAILURE_MESSAGE : null,
        intelligenceRunId: input.terminal ? null : run.id,
        intelligenceStatus: input.terminal ? "failed" : "processing",
      })
      .where(eq(meetingSession.id, run.meetingId));
    return true;
  });
}

function serializeRevision(row: {
  content: unknown;
  createdAt: Date;
  createdById: string | null;
  createdByName: string | null;
  id: string;
  model: string;
  promptVersion: string;
  provider: string;
  revision: number;
  templateKey: string;
  transcriptRevisionId: string;
}): MeetingIntelligenceRevision {
  return {
    content: meetingIntelligencePayloadSchema.parse(row.content),
    createdAt: row.createdAt.toISOString(),
    createdBy:
      row.createdById && row.createdByName
        ? { id: row.createdById, name: row.createdByName }
        : null,
    id: row.id,
    model: row.model,
    promptVersion: row.promptVersion,
    provider: row.provider,
    revision: row.revision,
    template: meetingIntelligenceTemplateSchema.parse(row.templateKey),
    transcriptRevisionId: row.transcriptRevisionId,
  };
}

export async function loadMeetingIntelligenceResult(input: {
  meetingId: string;
  organizationId: string;
}): Promise<MeetingIntelligenceResult | null> {
  const meeting = await db.query.meetingSession.findFirst({
    columns: {
      activeIntelligenceRevisionId: true,
      intelligenceError: true,
      intelligenceStatus: true,
    },
    where: { id: input.meetingId, organizationId: input.organizationId },
  });
  if (!meeting) {
    return null;
  }
  const rows = await db
    .select({
      content: meetingIntelligenceRevision.content,
      createdAt: meetingIntelligenceRevision.createdAt,
      createdById: meetingIntelligenceRevision.createdBy,
      createdByName: user.name,
      id: meetingIntelligenceRevision.id,
      model: meetingIntelligenceRevision.model,
      promptVersion: meetingIntelligenceRevision.promptVersion,
      provider: meetingIntelligenceRevision.provider,
      revision: meetingIntelligenceRevision.revision,
      templateKey: meetingIntelligenceRevision.templateKey,
      transcriptRevisionId: meetingIntelligenceRevision.transcriptRevisionId,
    })
    .from(meetingIntelligenceRevision)
    .leftJoin(user, eq(user.id, meetingIntelligenceRevision.createdBy))
    .where(
      and(
        eq(meetingIntelligenceRevision.meetingId, input.meetingId),
        eq(meetingIntelligenceRevision.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(meetingIntelligenceRevision.revision));
  const history = rows.map(serializeRevision);
  const linked = await db.query.meetingRecruitingContext.findFirst({
    columns: { meetingId: true },
    where: { meetingId: input.meetingId, organizationId: input.organizationId },
  });
  return {
    canRegenerate: false,
    current:
      history.find((revision) => revision.id === meeting.activeIntelligenceRevisionId) ?? null,
    error: meeting.intelligenceError,
    history,
    state: meetingIntelligenceStateSchema.parse(meeting.intelligenceStatus),
    suggestedTemplate: linked ? "recruiting-interview" : "general",
  };
}

export async function listRecoverableMeetingIntelligenceJobs(): Promise<
  MeetingIntelligenceJobData[]
> {
  const expiredLeaseStartedAt = new Date(Date.now() - PROCESSING_LEASE_MS);
  const rows = await db
    .select({
      id: meetingProcessingRun.id,
    })
    .from(meetingProcessingRun)
    .where(
      and(
        eq(meetingProcessingRun.stage, "meeting-intelligence"),
        or(
          eq(meetingProcessingRun.status, "pending"),
          and(
            eq(meetingProcessingRun.status, "processing"),
            lte(meetingProcessingRun.startedAt, expiredLeaseStartedAt),
          ),
        ),
      ),
    )
    .orderBy(asc(meetingProcessingRun.startedAt), asc(meetingProcessingRun.id))
    .limit(100);
  return rows.map((row) => ({ processingRunId: row.id }));
}

export async function listMeetingsNeedingAutomaticIntelligence(): Promise<
  { meetingId: string; organizationId: string }[]
> {
  const rows = await db
    .select({
      activeIntelligenceTranscriptRevisionId: meetingIntelligenceRevision.transcriptRevisionId,
      activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
      intelligenceStatus: meetingSession.intelligenceStatus,
      meetingId: meetingSession.id,
      organizationId: meetingSession.organizationId,
    })
    .from(meetingSession)
    .leftJoin(
      meetingIntelligenceRevision,
      eq(meetingIntelligenceRevision.id, meetingSession.activeIntelligenceRevisionId),
    )
    .where(
      and(
        eq(meetingSession.status, "ready"),
        eq(meetingSession.transcriptionStatus, "ready"),
        isNotNull(meetingSession.activeTranscriptRevisionId),
        isNull(meetingSession.intelligenceRunId),
        ne(meetingSession.intelligenceStatus, "failed"),
        or(
          isNull(meetingIntelligenceRevision.id),
          and(
            isNotNull(meetingIntelligenceRevision.id),
            ne(
              meetingIntelligenceRevision.transcriptRevisionId,
              meetingSession.activeTranscriptRevisionId,
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(meetingSession.updatedAt), asc(meetingSession.id))
    .limit(100);
  return rows.map((row) => ({
    meetingId: row.meetingId,
    organizationId: row.organizationId,
  }));
}
