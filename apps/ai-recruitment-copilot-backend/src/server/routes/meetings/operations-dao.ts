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
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAuditLog,
  meetingLiveTranscriptLease,
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptRevision,
} from "@arc/db-schema/schema";
import { resolveMeetingDirectUploadConcurrency } from "./capacity-dao";
import { resolveMeetingLiveTranscriptConcurrency } from "./routes/live-transcript/authorization-gate";

const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 30 * 60 * 1000;
const SAMPLE_LIMIT = 1000;
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
    const sinceMs =
      typeof row.since === "string" ? Date.parse(row.since) : (row.since?.getTime() ?? Number.NaN);
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
