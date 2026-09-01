import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "../db";
import {
  meetingAuditLog,
  meetingLiveTranscriptLease,
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptRevision,
} from "@arc/db-schema/schema";

// 容量配置只接受正整数，空值、零或非法输入均使用已审定默认值。 / Capacity settings accept positive integers only; missing, zero, or invalid values use the reviewed default.
function resolvePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// 运营快照中的直传容量必须与服务端同名环境阈值一致，默认 100。 / Keeps the operations snapshot aligned with the server's direct-upload environment limit, defaulting to 100.
function resolveMeetingDirectUploadConcurrency(): number {
  return resolvePositiveInteger(process.env.MEETING_DIRECT_UPLOAD_CONCURRENCY, 100);
}

// 运营快照中的实时转写容量必须与租约准入阈值一致，默认 100。 / Keeps reported live-transcription capacity aligned with lease admission, defaulting to 100.
function resolveMeetingLiveTranscriptConcurrency(): number {
  return resolvePositiveInteger(process.env.MEETING_LIVE_TRANSCRIPT_CONCURRENCY, 100);
}

// 延迟、失败与清理结果仅统计最近 24 小时，避免历史数据淹没当前健康度。 / Limits latency, failures, and purge outcomes to 24 hours so history does not mask current health.
const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;
// 上传、媒体处理或转写超过 30 分钟无进展时进入运营告警。 / Raises an operations alert when upload, media processing, or transcription makes no progress for 30 minutes.
const STUCK_AFTER_MS = 30 * 60 * 1000;
// 每种延迟最多读取 1000 条，限制诊断端点的数据库与内存成本。 / Caps each latency query at 1,000 rows to bound diagnostics database and memory cost.
const SAMPLE_LIMIT = 1000;
// 每类卡住/失败告警最多返回 20 条，保持诊断响应可控。 / Returns at most 20 stuck or failed alerts per category to bound the diagnostics response.
const ALERT_LIMIT = 20;

interface LatencySummary {
  averageMs: number;
  count: number;
  maxMs: number;
}

function summarizeLatency(values: number[]): LatencySummary {
  if (values.length === 0) {
    return { averageMs: 0, count: 0, maxMs: 0 };
  }
  return {
    averageMs: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    count: values.length,
    maxMs: Math.max(...values),
  };
}

// 并行查询容量占用、阶段延迟、供应商失败、重试和卡住记录，生成单次一致的运营视图。 / Queries capacity, stage latency, provider failures, retries, and stuck records in parallel for one operations view.
export async function loadMeetingOperationsSnapshot() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - METRICS_WINDOW_MS);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
  const latestTranscriptionActivity = sql<Date | null>`(
    select coalesce(run.finished_at, run.started_at)
    from meeting_processing_run run
    where run.meeting_id = meeting_session.id
      and run.stage = 'final-transcription'
    order by run.started_at desc, run.id desc
    limit 1
  )`.mapWith(meetingProcessingRun.startedAt);
  const latestIntelligenceActivity = sql<Date | null>`(
    select coalesce(run.finished_at, run.started_at)
    from meeting_processing_run run
    where run.meeting_id = meeting_session.id
      and run.stage = 'meeting-intelligence'
    order by run.started_at desc, run.id desc
    limit 1
  )`.mapWith(meetingProcessingRun.startedAt);
  const [
    directUploadCapacity,
    liveDraftCapacity,
    saveToUploadRows,
    uploadToTranscriptRows,
    providerFailures,
    retryRows,
    purgeOutcomes,
    stuckUploads,
    stuckMedia,
    stuckTranscriptions,
    stuckIntelligence,
    failedPurges,
  ] = await Promise.all([
    db
      .select({ active: count() })
      .from(meetingSession)
      .where(gt(meetingSession.uploadLeaseExpiresAt, now)),
    db
      .select({
        active: sql<number>`count(distinct (${meetingLiveTranscriptLease.organizationId}, ${meetingLiveTranscriptLease.captureId}))::int`,
      })
      .from(meetingLiveTranscriptLease)
      .where(gt(meetingLiveTranscriptLease.expiresAt, now)),
    db
      .select({ savedAt: meetingSession.savedAt, verifiedAt: meetingSession.verifiedAt })
      .from(meetingSession)
      .where(and(isNotNull(meetingSession.verifiedAt), gt(meetingSession.verifiedAt, windowStart)))
      .orderBy(desc(meetingSession.verifiedAt))
      .limit(SAMPLE_LIMIT),
    db
      .select({
        transcriptAt: meetingTranscriptRevision.createdAt,
        verifiedAt: meetingSession.verifiedAt,
      })
      .from(meetingTranscriptRevision)
      .innerJoin(meetingSession, eq(meetingSession.id, meetingTranscriptRevision.meetingId))
      .where(
        and(
          eq(meetingTranscriptRevision.kind, "final"),
          isNotNull(meetingSession.verifiedAt),
          gt(meetingTranscriptRevision.createdAt, windowStart),
        ),
      )
      .orderBy(desc(meetingTranscriptRevision.createdAt))
      .limit(SAMPLE_LIMIT),
    db
      .select({
        count: count(),
        errorCode: meetingProcessingRun.errorCode,
        provider: meetingProcessingRun.provider,
        stage: meetingProcessingRun.stage,
      })
      .from(meetingProcessingRun)
      .where(
        and(
          gt(meetingProcessingRun.startedAt, windowStart),
          isNotNull(meetingProcessingRun.errorCode),
        ),
      )
      .groupBy(
        meetingProcessingRun.provider,
        meetingProcessingRun.stage,
        meetingProcessingRun.errorCode,
      ),
    db
      .select({
        maxAttempt: max(meetingProcessingRun.attempt),
        retries: sum(sql<number>`greatest(${meetingProcessingRun.attempt} - 1, 0)`),
        stage: meetingProcessingRun.stage,
      })
      .from(meetingProcessingRun)
      .where(gt(meetingProcessingRun.startedAt, windowStart))
      .groupBy(meetingProcessingRun.stage),
    db
      .select({ action: meetingAuditLog.action, count: count() })
      .from(meetingAuditLog)
      .where(
        and(
          gt(meetingAuditLog.createdAt, windowStart),
          inArray(meetingAuditLog.action, [
            "meeting.purge_requested",
            "meeting.purge_failed",
            "meeting.purged",
          ]),
        ),
      )
      .groupBy(meetingAuditLog.action),
    db
      .select({ id: meetingSession.id, since: meetingSession.savedAt })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.status, "uploading"),
          or(
            lt(meetingSession.uploadLeaseExpiresAt, now),
            and(
              isNull(meetingSession.uploadLeaseExpiresAt),
              lt(meetingSession.savedAt, stuckBefore),
            ),
          ),
        ),
      )
      .orderBy(meetingSession.savedAt)
      .limit(ALERT_LIMIT),
    db
      .select({ id: meetingSession.id, since: meetingSession.verifiedAt })
      .from(meetingSession)
      .where(
        and(
          inArray(meetingSession.status, ["workspace-verified", "processing"]),
          lt(meetingSession.verifiedAt, stuckBefore),
        ),
      )
      .orderBy(meetingSession.verifiedAt)
      .limit(ALERT_LIMIT),
    db
      .select({ id: meetingSession.id, since: latestTranscriptionActivity })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.status, "ready"),
          eq(meetingSession.transcriptionStatus, "processing"),
          sql`${latestTranscriptionActivity} < ${stuckBefore.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(latestTranscriptionActivity)
      .limit(ALERT_LIMIT),
    db
      .select({ id: meetingSession.id, since: latestIntelligenceActivity })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.status, "ready"),
          eq(meetingSession.intelligenceStatus, "processing"),
          sql`${latestIntelligenceActivity} < ${stuckBefore.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(latestIntelligenceActivity)
      .limit(ALERT_LIMIT),
    db
      .select({ id: meetingSession.id, since: meetingSession.purgeAfter })
      .from(meetingSession)
      .where(and(eq(meetingSession.status, "purging"), lt(meetingSession.purgeAfter, now)))
      .orderBy(meetingSession.purgeAfter)
      .limit(ALERT_LIMIT),
  ]);

  const alert = (kind: string, row: { id: string; since: Date | string | null }) => {
    let sinceMs = Number.NaN;
    if (row.since instanceof Date) {
      sinceMs = row.since.getTime();
    } else if (row.since) {
      sinceMs = Date.parse(row.since);
    }
    return {
      ageMs: Number.isFinite(sinceMs) ? Math.max(0, now.getTime() - sinceMs) : 0,
      kind,
      meetingId: row.id,
    };
  };

  return {
    alerts: [
      ...stuckUploads.map((row) => alert("stuck-upload", row)),
      ...stuckMedia.map((row) => alert("stuck-media-finalization", row)),
      ...stuckTranscriptions.map((row) => alert("stuck-final-transcription", row)),
      ...stuckIntelligence.map((row) => alert("stuck-intelligence", row)),
      ...failedPurges.map((row) => alert("failed-purge", row)),
    ],
    capacity: {
      directUpload: {
        active: directUploadCapacity[0]?.active ?? 0,
        limit: resolveMeetingDirectUploadConcurrency(),
      },
      liveDraft: {
        active: liveDraftCapacity[0]?.active ?? 0,
        limit: resolveMeetingLiveTranscriptConcurrency(),
      },
    },
    generatedAt: now.toISOString(),
    latency: {
      saveToUpload: summarizeLatency(
        saveToUploadRows.flatMap((row) =>
          row.verifiedAt ? [row.verifiedAt.getTime() - row.savedAt.getTime()] : [],
        ),
      ),
      uploadToTranscript: summarizeLatency(
        uploadToTranscriptRows.flatMap((row) =>
          row.verifiedAt ? [row.transcriptAt.getTime() - row.verifiedAt.getTime()] : [],
        ),
      ),
    },
    providerFailures: providerFailures.map((row) => ({
      count: row.count,
      errorCode: row.errorCode ?? "unknown",
      provider: row.provider,
      stage: row.stage,
    })),
    purgeOutcomes,
    queueRetries: retryRows.map((row) => ({
      maxAttempt: row.maxAttempt ?? 0,
      retries: Number(row.retries ?? 0),
      stage: row.stage,
    })),
  };
}
