/* oxlint-disable complexity, no-nested-ternary, typescript/consistent-type-imports -- Intelligence remains transactional; Nest needs MeetingCoreService at runtime. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingRecruitingContext,
  meetingSession,
  user,
} from "@arc/db-schema/schema";
import {
  isMeetingIntelligenceQueueConfigured,
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  meetingIntelligencePayloadSchema,
  meetingIntelligenceTemplateSchema,
} from "@arc/shared/meeting-intelligence";
import type { MeetingIntelligenceTemplate } from "@arc/shared/meeting-intelligence";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import { MeetingCoreService } from "./meeting-core.service.js";

function generatorSnapshot() {
  const model =
    rawBackendEnvironment.MEETING_INTELLIGENCE_MODEL?.trim() || "alibaba/deepseek-v4-flash-0731";
  return { model, provider: model.split("/", 1)[0] || "unknown" };
}

@Injectable()
export class MeetingIntelligenceService {
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
    if (!authorized) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    return authorized;
  }

  async get(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    const rows = await this.database
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
          eq(meetingIntelligenceRevision.meetingId, meetingId),
          eq(meetingIntelligenceRevision.organizationId, organizationId),
        ),
      )
      .orderBy(desc(meetingIntelligenceRevision.revision));
    const history = rows.map((row) => ({
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
    }));
    const linked = await this.database.query.meetingRecruitingContext.findFirst({
      columns: { meetingId: true },
      where: { meetingId, organizationId },
    });
    if (accessRole === "administrator") {
      await this.database.insert(meetingAuditLog).values({
        action: "meeting.intelligence_accessed",
        actorId: userId,
        id: randomUUID(),
        meetingId,
        organizationId,
      });
    }
    return {
      canRegenerate: accessRole === "administrator" || accessRole === "owner",
      current:
        history.find((revision) => revision.id === meeting.activeIntelligenceRevisionId) ?? null,
      error: meeting.intelligenceError,
      history,
      state: meeting.intelligenceStatus,
      suggestedTemplate: linked ? ("recruiting-interview" as const) : ("general" as const),
    };
  }

  async requestAutomatic(organizationId: string, meetingId: string): Promise<void> {
    if (!isMeetingIntelligenceQueueConfigured(rawBackendEnvironment)) {
      return;
    }
    const generator = generatorSnapshot();
    const run = await this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          status: meetingSession.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
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
      const [current, recruiting] = await Promise.all([
        meeting.activeIntelligenceRevisionId
          ? tx
              .select({ templateKey: meetingIntelligenceRevision.templateKey })
              .from(meetingIntelligenceRevision)
              .where(eq(meetingIntelligenceRevision.id, meeting.activeIntelligenceRevisionId))
              .limit(1)
          : Promise.resolve([]),
        tx
          .select({ meetingId: meetingRecruitingContext.meetingId })
          .from(meetingRecruitingContext)
          .where(
            and(
              eq(meetingRecruitingContext.meetingId, meetingId),
              eq(meetingRecruitingContext.organizationId, organizationId),
            ),
          )
          .limit(1),
      ]);
      const template = current[0]
        ? meetingIntelligenceTemplateSchema.parse(current[0].templateKey)
        : recruiting[0]
          ? "recruiting-interview"
          : "general";
      const idempotencyKey = [
        "meeting-intelligence",
        meetingId,
        meeting.activeTranscriptRevisionId,
        template,
        generator.provider,
        generator.model,
        MEETING_INTELLIGENCE_PIPELINE_VERSION,
        MEETING_INTELLIGENCE_PROMPT_VERSION,
      ].join(":");
      const processingRunId = randomUUID();
      const [inserted] = await tx
        .insert(meetingProcessingRun)
        .values({
          attempt: 0,
          id: processingRunId,
          idempotencyKey,
          inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
          meetingId,
          model: generator.model,
          organizationId,
          pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
          promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
          provider: generator.provider,
          region: "default",
          requestKind: "automatic",
          requestedBy: null,
          stage: "meeting-intelligence",
          status: "pending",
          templateKey: template,
        })
        .onConflictDoNothing({ target: meetingProcessingRun.idempotencyKey })
        .returning({ id: meetingProcessingRun.id });
      if (!inserted) {
        return null;
      }
      await tx
        .update(meetingSession)
        .set({
          intelligenceError: null,
          intelligenceRunId: processingRunId,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, meetingId));
      return { processingRunId };
    });
    if (!run) {
      return;
    }
    try {
      await this.queueProducer.enqueueMeetingIntelligenceJobs([run]);
    } catch (error) {
      console.error("[meeting-intelligence] failed to enqueue automatic processing run", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        processingRunId: run.processingRunId,
      });
    }
  }

  async regenerate(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    template: MeetingIntelligenceTemplate,
  ) {
    const { accessRole } = await this.required(organizationId, userId, memberRole, meetingId);
    if (!(accessRole === "administrator" || accessRole === "owner")) {
      throw new ForbiddenException("无权重新生成 Meeting Intelligence", {
        errorCode: "MEETING_INTELLIGENCE_FORBIDDEN",
      });
    }
    if (!isMeetingIntelligenceQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("Meeting Intelligence 队列暂不可用", {
        errorCode: "MEETING_INTELLIGENCE_QUEUE_UNAVAILABLE",
      });
    }
    const generator = generatorSnapshot();
    const run = await this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select()
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update")
        .limit(1);
      if (
        !meeting?.activeTranscriptRevisionId ||
        meeting.status !== "ready" ||
        meeting.transcriptionStatus !== "ready"
      ) {
        throw new ConflictException("最终转录尚未就绪", {
          errorCode: "MEETING_TRANSCRIPT_NOT_READY",
        });
      }
      const processingRunId = randomUUID();
      await tx.insert(meetingProcessingRun).values({
        attempt: 0,
        id: processingRunId,
        idempotencyKey: [
          "meeting-intelligence",
          meetingId,
          meeting.activeTranscriptRevisionId,
          template,
          generator.provider,
          generator.model,
          MEETING_INTELLIGENCE_PIPELINE_VERSION,
          MEETING_INTELLIGENCE_PROMPT_VERSION,
          "manual",
          randomUUID(),
        ].join(":"),
        inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
        meetingId,
        model: generator.model,
        organizationId,
        pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
        promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
        provider: generator.provider,
        region: "default",
        requestKind: "manual",
        requestedBy: userId,
        stage: "meeting-intelligence",
        status: "pending",
        templateKey: template,
      });
      if (meeting.intelligenceRunId) {
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
          intelligenceRunId: processingRunId,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, meetingId));
      await tx.insert(meetingAuditLog).values({
        action: "meeting.intelligence_regeneration_requested",
        actorId: userId,
        detail: { processingRunId, template },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      return { processingRunId };
    });
    try {
      await this.queueProducer.enqueueMeetingIntelligenceJobs([run]);
    } catch (error) {
      console.error("[meeting-intelligence] failed to enqueue processing run", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        processingRunId: run.processingRunId,
      });
    }
    return { state: "processing" as const };
  }
}
