/* oxlint-disable complexity, max-lines, no-nested-ternary, typescript/consistent-type-imports -- Processing reads share one boundary; Nest needs injected service classes at runtime. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  meetingAuditLog,
  meetingProcessingRun,
  meetingRecordingAsset,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  meetingTranscriptionChunk,
  meetingTranscriptionPolicy,
  user,
} from "@arc/db-schema/schema";
import {
  enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-playback";
import {
  isMeetingTranscriptionQueueConfigured,
  MEETING_TRANSCRIPTION_PIPELINE_VERSION,
  retryMeetingTranscriptionJob,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { and, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT, WORKSPACE_OBJECT_STORAGE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort, WorkspaceObjectStoragePort } from "../workspace.ports.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import { MeetingIntelligenceService } from "./meeting-intelligence.service.js";
import { rebuildMeetingSearchProjection } from "./meeting-search.service.js";
import type {
  updateMeetingTranscriptionPolicySchema,
  createMeetingTranscriptCorrectionSchema,
} from "./meeting.schemas.js";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

function qwenCandidate() {
  if (!enabled(process.env.MEETING_TRANSCRIPTION_QWEN_ENABLED)) {
    return null;
  }
  const { origin } = new URL(
    process.env.MEETING_TRANSCRIPTION_QWEN_BASE_URL || "https://dashscope.aliyuncs.com",
  );
  return {
    id: "qwen" as const,
    label: "通义千问 ASR（百炼 Qwen3-ASR-Flash）",
    model: process.env.MEETING_TRANSCRIPTION_QWEN_MODEL || "qwen3-asr-flash-filetrans",
    region: origin === "https://dashscope-intl.aliyuncs.com" ? "qwen-singapore" : "qwen-cn-beijing",
  };
}

@Injectable()
export class MeetingProcessingService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    private readonly core: MeetingCoreService,
    private readonly intelligence: MeetingIntelligenceService,
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

  async playback(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const { meeting } = await this.required(organizationId, userId, memberRole, meetingId);
    const playback = meeting.assets.find(
      (asset) => asset.track === "playback" && asset.status === "ready",
    );
    if (!(playback && (meeting.status === "ready" || meeting.status === "trashed"))) {
      throw new NotFoundException("Meeting playback 尚不可用", {
        errorCode: "MEETING_PLAYBACK_NOT_FOUND",
      });
    }
    const expiresInSeconds = 300;
    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      url: await this.storage.presignGet(playback.storageKey, expiresInSeconds),
    };
  }

  async retryPlayback(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (!(accessRole === "administrator" || accessRole === "owner")) {
      throw new ForbiddenException("无权重试 Meeting playback", {
        errorCode: "MEETING_PLAYBACK_RETRY_FORBIDDEN",
      });
    }
    if (meeting.status === "ready") {
      return { state: "ready" as const };
    }
    if (meeting.status !== "processing-failed") {
      return { state: "processing" as const };
    }
    if (!isMeetingProcessingQueueConfigured()) {
      throw new ServiceUnavailableException("Meeting playback 队列暂不可用", {
        errorCode: "MEETING_PLAYBACK_QUEUE_UNAVAILABLE",
      });
    }
    await enqueueMeetingPlaybackJobs([{ meetingId, organizationId }]);
    return { state: "processing" as const };
  }

  async policy(organizationId: string, memberRole: string) {
    const available = qwenCandidate();
    const row = await this.database.query.meetingTranscriptionPolicy.findFirst({
      where: { organizationId },
    });
    const defaulted = !row && available;
    return {
      allowedProviders: row
        ? row.allowedProviders.filter((provider) => provider === "qwen" && available)
        : defaulted
          ? ["qwen" as const]
          : [],
      availableProviders: available ? [available] : [],
      canManage: memberRole === "owner" || memberRole === "admin",
      fallbackProvider: row?.fallbackProvider === "qwen" && available ? ("qwen" as const) : null,
      revision: row?.revision ?? 0,
      selectedProvider:
        row?.selectedProvider === "qwen" && available
          ? ("qwen" as const)
          : defaulted
            ? ("qwen" as const)
            : null,
      selectionReason:
        row?.selectionReason ?? (defaulted ? "未配置转录策略时默认使用百炼 Qwen ASR" : null),
    };
  }

  async updatePolicy(
    organizationId: string,
    userId: string,
    memberRole: string,
    input: z.infer<typeof updateMeetingTranscriptionPolicySchema>,
  ) {
    if (!(memberRole === "owner" || memberRole === "admin")) {
      throw new ForbiddenException("只有 Workspace Administrator 可以修改转录策略", {
        errorCode: "MEETING_TRANSCRIPTION_POLICY_FORBIDDEN",
      });
    }
    const available = qwenCandidate();
    if (input.allowedProviders.some((provider) => provider !== "qwen" || !available)) {
      throw new BadRequestException("所选转录 provider 未在当前部署启用", {
        errorCode: "MEETING_TRANSCRIPTION_PROVIDER_UNAVAILABLE",
      });
    }
    await this.database
      .insert(meetingTranscriptionPolicy)
      .values({
        allowedProviders: input.allowedProviders,
        fallbackProvider: input.fallbackProvider,
        organizationId,
        selectedProvider: input.selectedProvider,
        selectionReason: input.selectionReason,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        set: {
          allowedProviders: input.allowedProviders,
          fallbackProvider: input.fallbackProvider,
          revision: sql`${meetingTranscriptionPolicy.revision} + 1`,
          selectedProvider: input.selectedProvider,
          selectionReason: input.selectionReason,
          updatedAt: new Date(),
          updatedBy: userId,
        },
        target: meetingTranscriptionPolicy.organizationId,
      });
    return this.policy(organizationId, memberRole);
  }

  private async serializeRevision(revision: typeof meetingTranscriptRevision.$inferSelect) {
    const [turns, creator] = await Promise.all([
      this.database
        .select()
        .from(meetingTranscriptTurn)
        .where(eq(meetingTranscriptTurn.revisionId, revision.id))
        .orderBy(meetingTranscriptTurn.sequence),
      revision.createdBy
        ? this.database.query.user.findFirst({
            columns: { id: true, name: true },
            where: { id: revision.createdBy },
          })
        : null,
    ]);
    return {
      basedOnRevisionId: revision.basedOnRevisionId,
      createdAt: revision.createdAt.toISOString(),
      createdBy: creator ?? null,
      id: revision.id,
      kind: revision.kind === "human" ? ("human" as const) : ("final" as const),
      language: revision.language,
      model: revision.model,
      provider: revision.provider === "qwen" ? ("qwen" as const) : revision.provider,
      region: revision.region,
      revision: revision.revision,
      turns: turns.map((turn) => ({
        confidence: turn.confidence,
        endMs: turn.endMs,
        id: turn.id,
        sequence: turn.sequence,
        speakerDisplayName: turn.speakerDisplayName,
        speakerKey: turn.speakerKey,
        startMs: turn.startMs,
        text: turn.text,
        track: turn.track === "local" ? ("local" as const) : ("remote" as const),
      })),
    };
  }

  async transcript(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const { meeting } = await this.required(organizationId, userId, memberRole, meetingId);
    const revision = meeting.activeTranscriptRevisionId
      ? await this.database.query.meetingTranscriptRevision.findFirst({
          where: {
            id: meeting.activeTranscriptRevisionId,
            meetingId,
            organizationId,
          },
        })
      : null;
    return {
      draft: meeting.liveTranscriptDraft,
      error: meeting.transcriptionError,
      revision: revision ? await this.serializeRevision(revision) : null,
      state: meeting.transcriptionStatus,
    };
  }

  async transcriptHistory(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
  ) {
    await this.required(organizationId, userId, memberRole, meetingId);
    const rows = await this.database
      .select({
        basedOnRevisionId: meetingTranscriptRevision.basedOnRevisionId,
        createdAt: meetingTranscriptRevision.createdAt,
        createdById: meetingTranscriptRevision.createdBy,
        createdByName: user.name,
        id: meetingTranscriptRevision.id,
        kind: meetingTranscriptRevision.kind,
        language: meetingTranscriptRevision.language,
        model: meetingTranscriptRevision.model,
        provider: meetingTranscriptRevision.provider,
        region: meetingTranscriptRevision.region,
        revision: meetingTranscriptRevision.revision,
      })
      .from(meetingTranscriptRevision)
      .leftJoin(user, eq(user.id, meetingTranscriptRevision.createdBy))
      .where(
        and(
          eq(meetingTranscriptRevision.meetingId, meetingId),
          eq(meetingTranscriptRevision.organizationId, organizationId),
        ),
      )
      .orderBy(desc(meetingTranscriptRevision.revision));
    return {
      records: rows.map((row) => ({
        basedOnRevisionId: row.basedOnRevisionId,
        createdAt: row.createdAt.toISOString(),
        createdBy:
          row.createdById && row.createdByName
            ? { id: row.createdById, name: row.createdByName }
            : null,
        id: row.id,
        kind: row.kind === "human" ? ("human" as const) : ("final" as const),
        language: row.language,
        model: row.model,
        provider: row.provider,
        region: row.region,
        revision: row.revision,
      })),
    };
  }

  async transcriptRevision(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    revisionId: string,
  ) {
    await this.required(organizationId, userId, memberRole, meetingId);
    const revision = await this.database.query.meetingTranscriptRevision.findFirst({
      where: { id: revisionId, meetingId, organizationId },
    });
    if (!revision) {
      throw new NotFoundException("Transcript revision 不存在", {
        errorCode: "MEETING_TRANSCRIPT_REVISION_NOT_FOUND",
      });
    }
    return this.serializeRevision(revision);
  }

  async correctTranscript(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    correction: z.infer<typeof createMeetingTranscriptCorrectionSchema>,
  ) {
    const { accessRole, meeting: authorizedMeeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (!(accessRole === "administrator" || accessRole === "owner" || accessRole === "editor")) {
      throw new ForbiddenException("无权修正会议转录", {
        errorCode: "MEETING_TRANSCRIPT_CORRECTION_FORBIDDEN",
      });
    }
    if (
      authorizedMeeting.transcriptionStatus !== "ready" ||
      !authorizedMeeting.activeTranscriptRevisionId
    ) {
      throw new ConflictException("Final Meeting Transcript 尚未就绪", {
        errorCode: "MEETING_TRANSCRIPT_NOT_READY",
      });
    }
    const created = await this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          intelligenceRunId: meetingSession.intelligenceRunId,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        throw new NotFoundException("Meeting Session 不存在", {
          errorCode: "MEETING_NOT_FOUND",
        });
      }
      if (meeting.activeTranscriptRevisionId !== correction.sourceRevisionId) {
        throw new ConflictException("会议转录已被其他人更新，请刷新后重试", {
          errorCode: "MEETING_TRANSCRIPT_REVISION_CONFLICT",
        });
      }
      const [source] = await tx
        .select()
        .from(meetingTranscriptRevision)
        .where(
          and(
            eq(meetingTranscriptRevision.id, correction.sourceRevisionId),
            eq(meetingTranscriptRevision.meetingId, meetingId),
            eq(meetingTranscriptRevision.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!source) {
        throw new ConflictException("会议转录已被其他人更新，请刷新后重试", {
          errorCode: "MEETING_TRANSCRIPT_REVISION_CONFLICT",
        });
      }
      const sourceTurns = await tx
        .select({
          speakerDisplayName: meetingTranscriptTurn.speakerDisplayName,
          speakerKey: meetingTranscriptTurn.speakerKey,
        })
        .from(meetingTranscriptTurn)
        .where(eq(meetingTranscriptTurn.revisionId, source.id));
      const sourceNames = new Map(
        sourceTurns.map((turn) => [turn.speakerKey, turn.speakerDisplayName]),
      );
      const renamedSpeakerKeys = [
        ...new Set(
          correction.turns.flatMap((turn) =>
            sourceNames.get(turn.speakerKey) === turn.speakerDisplayName ? [] : [turn.speakerKey],
          ),
        ),
      ];
      const [duration] = await tx
        .select({ durationMs: max(meetingRecordingAsset.durationMs) })
        .from(meetingRecordingAsset)
        .where(
          and(
            eq(meetingRecordingAsset.meetingId, meetingId),
            inArray(meetingRecordingAsset.track, ["microphone", "system"]),
          ),
        );
      if (correction.turns.some((turn) => turn.endMs > Number(duration?.durationMs ?? 0))) {
        throw new BadRequestException("转录时间超出可播放录音范围", {
          errorCode: "MEETING_TRANSCRIPT_INVALID_RANGE",
        });
      }
      const [latest] = await tx
        .select({ revision: max(meetingTranscriptRevision.revision) })
        .from(meetingTranscriptRevision)
        .where(eq(meetingTranscriptRevision.meetingId, meetingId));
      const revisionId = randomUUID();
      const [revision] = await tx
        .insert(meetingTranscriptRevision)
        .values({
          basedOnRevisionId: source.id,
          createdBy: userId,
          id: revisionId,
          kind: "human",
          language: correction.language,
          meetingId,
          model: source.model,
          organizationId,
          pipelineVersion: source.pipelineVersion,
          processingRunId: null,
          provider: source.provider,
          region: source.region,
          revision: Number(latest?.revision ?? 0) + 1,
          sourceManifestSha256: source.sourceManifestSha256,
        })
        .returning();
      if (!revision) {
        throw new Error("创建人工修订失败");
      }
      const turns = correction.turns.map((turn, sequence) => ({
        ...turn,
        id: randomUUID(),
        revisionId,
        sequence,
      }));
      for (let offset = 0; offset < turns.length; offset += 500) {
        await tx.insert(meetingTranscriptTurn).values(turns.slice(offset, offset + 500));
      }
      if (meeting.intelligenceRunId) {
        await tx
          .update(meetingProcessingRun)
          .set({
            errorCode: "superseded",
            errorMessage: "Authoritative transcript was corrected",
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
          activeTranscriptRevisionId: revisionId,
          intelligenceError: null,
          intelligenceRunId: null,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, meetingId));
      await tx.insert(meetingAuditLog).values({
        action: "meeting.transcript_corrected",
        actorId: userId,
        detail: { renamedSpeakerKeys, revisionId, sourceRevisionId: source.id },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      return { revision, turns };
    });
    const actor = await this.database.query.user.findFirst({
      columns: { name: true },
      where: { id: userId },
    });
    await this.intelligence.requestAutomatic(organizationId, meetingId).catch((error) => {
      console.error("[meeting-transcription] failed to request corrected intelligence", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        meetingId,
      });
    });
    return {
      basedOnRevisionId: created.revision.basedOnRevisionId,
      createdAt: created.revision.createdAt.toISOString(),
      createdBy: { id: userId, name: actor?.name ?? "" },
      id: created.revision.id,
      kind: "human" as const,
      language: created.revision.language,
      model: created.revision.model,
      provider: created.revision.provider,
      region: created.revision.region,
      revision: created.revision.revision,
      turns: created.turns.map((turn) => ({
        confidence: turn.confidence,
        endMs: turn.endMs,
        id: turn.id,
        sequence: turn.sequence,
        speakerDisplayName: turn.speakerDisplayName,
        speakerKey: turn.speakerKey,
        startMs: turn.startMs,
        text: turn.text,
        track: turn.track,
      })),
    };
  }

  async retryTranscript(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (!(accessRole === "administrator" || accessRole === "owner")) {
      throw new ForbiddenException("无权重试最终转录", {
        errorCode: "MEETING_TRANSCRIPT_RETRY_FORBIDDEN",
      });
    }
    if (meeting.transcriptionStatus === "ready") {
      return { state: "ready" as const };
    }
    if (meeting.transcriptionStatus !== "failed") {
      return { state: "processing" as const };
    }
    if (!isMeetingTranscriptionQueueConfigured()) {
      throw new ServiceUnavailableException("最终转录 provider 或队列暂不可用", {
        errorCode: "MEETING_TRANSCRIPTION_UNAVAILABLE",
      });
    }
    const reset = await this.database.transaction(async (tx) => {
      const rows = await tx
        .update(meetingSession)
        .set({ transcriptionError: null, transcriptionStatus: "pending" })
        .where(
          and(
            eq(meetingSession.id, meetingId),
            eq(meetingSession.organizationId, organizationId),
            eq(meetingSession.transcriptionStatus, "failed"),
          ),
        )
        .returning({ id: meetingSession.id });
      if (rows.length > 0) {
        await tx
          .delete(meetingTranscriptionChunk)
          .where(
            and(
              eq(meetingTranscriptionChunk.meetingId, meetingId),
              eq(meetingTranscriptionChunk.organizationId, organizationId),
              ne(meetingTranscriptionChunk.status, "succeeded"),
            ),
          );
      }
      return rows.length > 0;
    });
    if (!reset) {
      return { state: "processing" as const };
    }
    let policy = await this.database.query.meetingTranscriptionPolicy.findFirst({
      where: { organizationId },
    });
    const candidate = qwenCandidate();
    if (!policy && candidate) {
      await this.database
        .insert(meetingTranscriptionPolicy)
        .values({
          allowedProviders: ["qwen"],
          organizationId,
          selectedProvider: "qwen",
          selectionReason: "未配置转录策略时默认使用百炼 Qwen ASR",
        })
        .onConflictDoNothing({ target: meetingTranscriptionPolicy.organizationId });
      policy = await this.database.query.meetingTranscriptionPolicy.findFirst({
        where: { organizationId },
      });
    }
    const sourcesReady = ["microphone", "system"].every((track) =>
      meeting.assets.some((asset) => asset.track === track && asset.status === "ready"),
    );
    if (!(candidate && policy?.allowedProviders.includes("qwen") && sourcesReady)) {
      throw new ServiceUnavailableException("最终转录 provider 或队列暂不可用", {
        errorCode: "MEETING_TRANSCRIPTION_UNAVAILABLE",
      });
    }
    await retryMeetingTranscriptionJob({
      meetingId,
      model: candidate.model,
      organizationId,
      pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
      policyRevision: policy.revision,
      provider: "qwen",
      region: candidate.region,
      sourceManifestSha256: meeting.manifestSha256,
    });
    await this.database.insert(meetingAuditLog).values({
      action: "meeting.transcription_retried",
      actorId: userId,
      detail: { provider: "qwen" },
      id: randomUUID(),
      meetingId,
      organizationId,
    });
    return { state: "processing" as const };
  }
}
