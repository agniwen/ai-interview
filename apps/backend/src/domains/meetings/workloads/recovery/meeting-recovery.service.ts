/* oxlint-disable max-lines -- Meeting recovery owns the complete lease discovery and automatic-intelligence recovery lifecycle. */
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import {
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingQuestionExchange,
  meetingSession,
  meetingTranscriptionPolicy,
} from "@arc/db-schema/schema";
import {
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceTemplate } from "@arc/shared/meeting-intelligence";
import { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import { BackendConfigService } from "../../../../config/backend-config.service.js";
import { BACKGROUND_DATABASE } from "../../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type { MeetingRecoveryCommands } from "./meeting-recovery.commands.js";

const INTELLIGENCE_PROCESSING_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_QWEN_MODEL = "qwen3-asr-flash-filetrans";
const DEFAULT_QWEN_POLICY_REASON = "未配置转录策略时默认使用百炼 Qwen ASR";

@Injectable()
export class MeetingRecoveryService implements MeetingRecoveryCommands {
  constructor(
    @Inject(BACKGROUND_DATABASE) private readonly database: Database,
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  listRecoverableMeetingPlaybackJobs() {
    return this.database
      .select({ meetingId: meetingSession.id, organizationId: meetingSession.organizationId })
      .from(meetingSession)
      .where(
        or(
          eq(meetingSession.status, "workspace-verified"),
          eq(meetingSession.status, "processing"),
        ),
      );
  }

  listRecoverableMeetingPurgeJobs(now = new Date()) {
    return this.database
      .select({ meetingId: meetingSession.id, organizationId: meetingSession.organizationId })
      .from(meetingSession)
      .where(
        or(
          and(eq(meetingSession.status, "trashed"), lte(meetingSession.purgeAfter, now)),
          and(
            eq(meetingSession.status, "purging"),
            lte(meetingSession.purgeAfter, now),
            or(
              isNull(meetingSession.purgeLeaseExpiresAt),
              lte(meetingSession.purgeLeaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(meetingSession.purgeAfter), asc(meetingSession.id))
      .limit(100);
  }

  listRecoverableMeetingAnswerJobs() {
    return this.database
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

  async listRecoverableMeetingIntelligenceJobs() {
    const rows = await this.database
      .select({ id: meetingProcessingRun.id })
      .from(meetingProcessingRun)
      .where(
        and(
          eq(meetingProcessingRun.stage, "meeting-intelligence"),
          or(
            eq(meetingProcessingRun.status, "pending"),
            and(
              eq(meetingProcessingRun.status, "processing"),
              lte(
                meetingProcessingRun.startedAt,
                new Date(Date.now() - INTELLIGENCE_PROCESSING_LEASE_MS),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(meetingProcessingRun.startedAt), asc(meetingProcessingRun.id))
      .limit(100);
    return rows.map((row) => ({ processingRunId: row.id }));
  }

  async listRecoverableMeetingTranscriptionJobs() {
    const region = this.qwenRegion();
    if (!region) {
      return [];
    }
    const meetings = await this.database.query.meetingSession.findMany({
      where: { status: "ready", transcriptionStatus: { in: ["pending", "processing"] } },
      with: { assets: true },
    });
    const organizationIds = [...new Set(meetings.map((meeting) => meeting.organizationId))];
    if (organizationIds.length === 0) {
      return [];
    }
    for (const organizationId of organizationIds) {
      await this.database
        .insert(meetingTranscriptionPolicy)
        .values({
          allowedProviders: ["qwen"],
          organizationId,
          selectedProvider: "qwen",
          selectionReason: DEFAULT_QWEN_POLICY_REASON,
        })
        .onConflictDoNothing({ target: meetingTranscriptionPolicy.organizationId });
    }
    const policies = await this.database
      .select()
      .from(meetingTranscriptionPolicy)
      .where(inArray(meetingTranscriptionPolicy.organizationId, organizationIds));
    const policyByOrganization = new Map(policies.map((policy) => [policy.organizationId, policy]));
    return meetings.flatMap((meeting) => {
      const policy = policyByOrganization.get(meeting.organizationId);
      const ready = ["microphone", "system"].every((track) =>
        meeting.assets.some((asset) => asset.track === track && asset.status === "ready"),
      );
      if (!(policy && ready && policy.allowedProviders.includes("qwen"))) {
        return [];
      }
      return [
        {
          meetingId: meeting.id,
          model: this.config.get("MEETING_TRANSCRIPTION_QWEN_MODEL")?.trim() || DEFAULT_QWEN_MODEL,
          organizationId: meeting.organizationId,
          pipelineVersion: "final-v1" as const,
          policyRevision: policy.revision,
          provider: "qwen" as const,
          region,
          sourceManifestSha256: meeting.manifestSha256,
        },
      ];
    });
  }

  async recoverMissingMeetingIntelligence(): Promise<void> {
    const model = this.config.get("MEETING_INTELLIGENCE_MODEL")?.trim();
    if (!model) {
      throw new Error("MEETING_INTELLIGENCE_MODEL is required for intelligence recovery");
    }
    const provider = model.split("/", 1)[0] || "unknown";
    const missing = await this.listMeetingsNeedingAutomaticIntelligence();
    const jobs: { processingRunId: string }[] = [];
    for (const meeting of missing) {
      const run = await this.createAutomaticRun({ ...meeting, model, provider });
      if (run) {
        jobs.push({ processingRunId: run });
      }
    }
    if (jobs.length > 0) {
      await this.queueProducer.enqueueMeetingIntelligenceJobs(jobs);
    }
  }

  private listMeetingsNeedingAutomaticIntelligence() {
    return this.database
      .select({
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
            ne(
              meetingIntelligenceRevision.transcriptRevisionId,
              meetingSession.activeTranscriptRevisionId,
            ),
          ),
        ),
      )
      .orderBy(asc(meetingSession.updatedAt), asc(meetingSession.id))
      .limit(100);
  }

  private createAutomaticRun(input: {
    meetingId: string;
    model: string;
    organizationId: string;
    provider: string;
  }): Promise<string | null> {
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          intelligenceRunId: meetingSession.intelligenceRunId,
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
      if (meeting.intelligenceRunId) {
        const [active] = await tx
          .select({ id: meetingProcessingRun.id, status: meetingProcessingRun.status })
          .from(meetingProcessingRun)
          .where(eq(meetingProcessingRun.id, meeting.intelligenceRunId))
          .for("update")
          .limit(1);
        if (active && ["pending", "processing"].includes(active.status)) {
          return active.id;
        }
      }
      const recruiting = await tx.query.meetingRecruitingContext.findFirst({
        columns: { meetingId: true },
        where: { meetingId: input.meetingId, organizationId: input.organizationId },
      });
      const template: MeetingIntelligenceTemplate = recruiting ? "recruiting-interview" : "general";
      const idempotencyKey = [
        "meeting-intelligence",
        input.meetingId,
        meeting.activeTranscriptRevisionId,
        template,
        input.provider,
        input.model,
        MEETING_INTELLIGENCE_PIPELINE_VERSION,
        MEETING_INTELLIGENCE_PROMPT_VERSION,
      ].join(":");
      const runId = randomUUID();
      const [inserted] = await tx
        .insert(meetingProcessingRun)
        .values({
          attempt: 0,
          id: runId,
          idempotencyKey,
          inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
          promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
          provider: input.provider,
          region: "default",
          requestKind: "automatic",
          requestedBy: null,
          stage: "meeting-intelligence",
          status: "pending",
          templateKey: template,
        })
        .onConflictDoNothing({ target: meetingProcessingRun.idempotencyKey })
        .returning({ id: meetingProcessingRun.id });
      const existingRows = inserted
        ? []
        : await tx
            .select({ id: meetingProcessingRun.id })
            .from(meetingProcessingRun)
            .where(eq(meetingProcessingRun.idempotencyKey, idempotencyKey))
            .limit(1);
      const existing = inserted?.id ?? existingRows[0]?.id;
      if (!existing) {
        return null;
      }
      if (meeting.intelligenceRunId && meeting.intelligenceRunId !== existing) {
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
          intelligenceRunId: existing,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, input.meetingId));
      return existing;
    });
  }

  private qwenRegion(): string | null {
    if (!this.config.get("MEETING_TRANSCRIPTION_QWEN_ENABLED")) {
      return null;
    }
    const raw =
      this.config.get("MEETING_TRANSCRIPTION_QWEN_BASE_URL") ??
      this.config.get("ALIBABA_BASE_URL") ??
      "https://dashscope.aliyuncs.com";
    const { origin } = new URL(raw);
    if (origin === "https://dashscope.aliyuncs.com") {
      return "qwen-cn-beijing";
    }
    if (origin === "https://dashscope-intl.aliyuncs.com") {
      return "qwen-singapore";
    }
    throw new Error("Meeting transcription Qwen endpoint is not a verified region");
  }
}
