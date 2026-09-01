import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingQuestionExchange,
  meetingSession,
  meetingTranscriptionPolicy,
  resumePoolItem,
  resumeSemanticIndex,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import { MEETING_TRANSCRIPTION_PIPELINE_VERSION } from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import { DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS } from "@arc/shared/bulk-resume-upload";
import type { Database } from "../infrastructure/database/database.tokens.js";

const INTELLIGENCE_PROCESSING_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_QWEN_MODEL = "qwen3-asr-flash-filetrans";
const DEFAULT_QWEN_POLICY_REASON = "未配置转录策略时默认使用百炼 Qwen ASR";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function qwenRegion(env: NodeJS.ProcessEnv): string | null {
  if (!["1", "true", "yes"].includes(env.MEETING_TRANSCRIPTION_QWEN_ENABLED?.toLowerCase() ?? "")) {
    return null;
  }
  const raw =
    env.MEETING_TRANSCRIPTION_QWEN_BASE_URL ??
    env.ALIBABA_BASE_URL ??
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

export class BackgroundRecoveryRepository {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;

  constructor(database: Database, env: NodeJS.ProcessEnv = process.env) {
    this.database = database;
    this.env = env;
  }

  async listRecoverableResumeParseJobs() {
    const threshold = positiveInteger(
      this.env.RESUME_PARSE_STALE_PROCESSING_SECONDS,
      DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS,
    );
    const stale = and(
      eq(resumeUploadBatchItem.status, "processing"),
      lt(
        resumeUploadBatchItem.startedAt,
        sql`now() - interval '${sql.raw(String(threshold))} seconds'`,
      ),
    );
    await this.database.transaction(async (tx) => {
      const staleItems = await tx
        .select({
          poolItemId: resumeUploadBatchItem.poolItemId,
          resumeRecordId: resumeUploadBatchItem.resumeRecordId,
        })
        .from(resumeUploadBatchItem)
        .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
        .where(and(inArray(resumeUploadBatch.status, ["pending", "running"]), stale));
      const recordIds = staleItems.flatMap((item) =>
        item.resumeRecordId ? [item.resumeRecordId] : [],
      );
      const poolItemIds = staleItems.flatMap((item) => (item.poolItemId ? [item.poolItemId] : []));
      const now = new Date();
      if (recordIds.length > 0) {
        await tx
          .update(studioInterview)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(inArray(studioInterview.id, recordIds));
      }
      if (poolItemIds.length > 0) {
        await tx
          .update(resumePoolItem)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(inArray(resumePoolItem.id, poolItemIds));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({ startedAt: null, status: "pending" })
        .where(
          and(
            inArray(
              resumeUploadBatchItem.batchId,
              tx
                .select({ id: resumeUploadBatch.id })
                .from(resumeUploadBatch)
                .where(inArray(resumeUploadBatch.status, ["pending", "running"])),
            ),
            stale,
          ),
        );
    });
    return this.database
      .select({
        batchId: resumeUploadBatchItem.batchId,
        itemId: resumeUploadBatchItem.id,
        organizationId: resumeUploadBatch.organizationId,
        userId: resumeUploadBatch.createdBy,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .where(
        and(
          inArray(resumeUploadBatch.status, ["pending", "running"]),
          eq(resumeUploadBatchItem.status, "pending"),
        ),
      );
  }

  listRecoverableResumeSemanticIndexJobs() {
    const embeddingVersion =
      this.env.RESUME_EMBEDDING_VERSION ?? "dashscope-text-embedding-v4-1024-v1";
    return this.database
      .select({
        organizationId: resumeSemanticIndex.organizationId,
        sourceId: resumeSemanticIndex.sourceId,
        sourceType: resumeSemanticIndex.sourceType,
      })
      .from(resumeSemanticIndex)
      .where(
        and(
          eq(resumeSemanticIndex.embeddingVersion, embeddingVersion),
          or(
            inArray(resumeSemanticIndex.status, ["pending", "failed"]),
            and(
              eq(resumeSemanticIndex.sourceType, "job_description"),
              eq(resumeSemanticIndex.status, "stale"),
            ),
          ),
        ),
      )
      .limit(500);
  }

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

  async listMeetingsNeedingAutomaticIntelligence() {
    const rows = await this.database
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
    return rows;
  }

  async listRecoverableMeetingTranscriptionJobs(): Promise<MeetingTranscriptionJobData[]> {
    const region = qwenRegion(this.env);
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
          model: this.env.MEETING_TRANSCRIPTION_QWEN_MODEL?.trim() || DEFAULT_QWEN_MODEL,
          organizationId: meeting.organizationId,
          pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
          policyRevision: policy.revision,
          provider: "qwen" as const,
          region,
          sourceManifestSha256: meeting.manifestSha256,
        },
      ];
    });
  }
}
