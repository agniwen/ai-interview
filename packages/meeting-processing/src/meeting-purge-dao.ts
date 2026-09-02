/* oxlint-disable max-lines -- the two-phase purge state machine shares transactional invariants. */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@app/database";
import {
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingPurgeTombstone,
  meetingQuestionThread,
  meetingRecordingAsset,
  meetingSession,
  meetingStorageCleanupKey,
  meetingTranscriptRevision,
} from "@app/db-schema/schema";
import type { MeetingPurgeJobData } from "@app/meeting-processing-queue/meeting-purge";

const PURGE_LEASE_MS = 30 * 60 * 1000;
const PROVIDER_PURGE_BATCH_SIZE = 20;
const PURGE_STORAGE_BATCH_SIZE = 100;
const PROVIDER_PURGE_MAX_ATTEMPTS = 5;
const UPLOAD_QUIET_PERIOD_MS = 61 * 60 * 1000;

export interface MeetingPurgeClaimResult {
  executionToken: string;
  hasMoreProviderArtifacts: boolean;
  hasMoreStorageKeys: boolean;
  multipartUploads: { storageKey: string; uploadId: string }[];
  phase: "final" | "initial";
  providerArtifacts: {
    processingRunId: string;
    provider: string;
    providerArtifact: unknown;
    stage: string;
  }[];
  storageCleanupKeys: string[];
  storageKeys: string[];
}

export function createMeetingPurgeDao(db: Database) {
  function listRecoverableMeetingPurgeJobs(now = new Date()): Promise<MeetingPurgeJobData[]> {
    return db
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

  async function claimMeetingPurge(
    input: MeetingPurgeJobData & { now?: Date },
  ): Promise<MeetingPurgeClaimResult | null> {
    const now = input.now ?? new Date();
    const executionToken = crypto.randomUUID();
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          purgeAfter: meetingSession.purgeAfter,
          purgeInitialSweepCompletedAt: meetingSession.purgeInitialSweepCompletedAt,
          purgeLeaseExpiresAt: meetingSession.purgeLeaseExpiresAt,
          status: meetingSession.status,
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
      if (!meeting) {
        return null;
      }
      const due = meeting.purgeAfter && meeting.purgeAfter.getTime() <= now.getTime();
      const leaseAvailable =
        !meeting.purgeLeaseExpiresAt || meeting.purgeLeaseExpiresAt.getTime() <= now.getTime();
      if (
        !due ||
        !leaseAvailable ||
        (meeting.status !== "trashed" && meeting.status !== "purging")
      ) {
        return null;
      }
      const [activeWriter] = await tx
        .select({ storageKey: meetingStorageCleanupKey.storageKey })
        .from(meetingStorageCleanupKey)
        .where(
          and(
            eq(meetingStorageCleanupKey.meetingId, input.meetingId),
            gt(meetingStorageCleanupKey.writerLeaseExpiresAt, now),
          ),
        )
        .limit(1);
      if (activeWriter) {
        return null;
      }
      await tx
        .update(meetingSession)
        .set({
          purgeClaimToken: executionToken,
          purgeLeaseExpiresAt: new Date(now.getTime() + PURGE_LEASE_MS),
          status: "purging",
        })
        .where(eq(meetingSession.id, input.meetingId));
      const phase = meeting.purgeInitialSweepCompletedAt ? "final" : "initial";
      const [assets, cleanupKeyRows, providerArtifactRows] = await Promise.all([
        tx
          .select({
            multipartUploadId: meetingRecordingAsset.multipartUploadId,
            status: meetingRecordingAsset.status,
            storageKey: meetingRecordingAsset.storageKey,
          })
          .from(meetingRecordingAsset)
          .where(eq(meetingRecordingAsset.meetingId, input.meetingId)),
        tx
          .select({ storageKey: meetingStorageCleanupKey.storageKey })
          .from(meetingStorageCleanupKey)
          .where(
            phase === "initial"
              ? and(
                  eq(meetingStorageCleanupKey.meetingId, input.meetingId),
                  isNull(meetingStorageCleanupKey.initialSweepCompletedAt),
                )
              : and(
                  eq(meetingStorageCleanupKey.meetingId, input.meetingId),
                  isNull(meetingStorageCleanupKey.finalSweepCompletedAt),
                ),
          )
          .orderBy(
            asc(meetingStorageCleanupKey.createdAt),
            asc(meetingStorageCleanupKey.storageKey),
          )
          .limit(PURGE_STORAGE_BATCH_SIZE + 1),
        tx
          .select({
            processingRunId: meetingProcessingRun.id,
            provider: meetingProcessingRun.provider,
            providerArtifact: meetingProcessingRun.result,
            stage: meetingProcessingRun.stage,
          })
          .from(meetingProcessingRun)
          .where(
            and(
              eq(meetingProcessingRun.meetingId, input.meetingId),
              or(
                isNull(meetingProcessingRun.remoteArtifactPurgeStatus),
                and(
                  eq(meetingProcessingRun.remoteArtifactPurgeStatus, "failed"),
                  lt(meetingProcessingRun.remoteArtifactPurgeAttempts, PROVIDER_PURGE_MAX_ATTEMPTS),
                ),
              ),
            ),
          )
          .orderBy(asc(meetingProcessingRun.startedAt), asc(meetingProcessingRun.id))
          .limit(PROVIDER_PURGE_BATCH_SIZE + 1),
      ]);
      const hasMoreStorageKeys = cleanupKeyRows.length > PURGE_STORAGE_BATCH_SIZE;
      const cleanupKeys = cleanupKeyRows.slice(0, PURGE_STORAGE_BATCH_SIZE);
      const providerBatchAvailable = phase === "final" && !hasMoreStorageKeys;
      const hasMoreProviderArtifacts =
        providerBatchAvailable && providerArtifactRows.length > PROVIDER_PURGE_BATCH_SIZE;
      const providerArtifacts = providerBatchAvailable
        ? providerArtifactRows.slice(0, PROVIDER_PURGE_BATCH_SIZE)
        : [];
      await tx.insert(meetingAuditLog).values({
        action: "meeting.purge_started",
        actorId: null,
        detail: { executionToken },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return {
        executionToken,
        hasMoreProviderArtifacts,
        hasMoreStorageKeys,
        multipartUploads: assets.flatMap((asset) =>
          asset.multipartUploadId && asset.status !== "ready"
            ? [{ storageKey: asset.storageKey, uploadId: asset.multipartUploadId }]
            : [],
        ),
        phase,
        providerArtifacts,
        storageCleanupKeys: cleanupKeys.map((row) => row.storageKey),
        storageKeys: [
          ...new Set([
            ...assets.map((row) => row.storageKey),
            ...cleanupKeys.map((row) => row.storageKey),
          ]),
        ],
      };
    });
  }

  async function continueMeetingPurgeProviderBatch(
    input: MeetingPurgeJobData & { executionToken: string; now?: Date },
  ): Promise<boolean> {
    const now = input.now ?? new Date();
    const [continued] = await db
      .update(meetingSession)
      .set({ purgeAfter: now, purgeClaimToken: null, purgeLeaseExpiresAt: null })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.status, "purging"),
          eq(meetingSession.purgeClaimToken, input.executionToken),
        ),
      )
      .returning({ id: meetingSession.id });
    return Boolean(continued);
  }

  async function completeMeetingPurgeStorageBatch(
    input: MeetingPurgeJobData & {
      executionToken: string;
      now?: Date;
      phase: "final" | "initial";
      storageCleanupKeys: string[];
    },
  ): Promise<"continue" | "quiet-period" | "ready"> {
    const now = input.now ?? new Date();
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          id: meetingSession.id,
          purgeInitialSweepCompletedAt: meetingSession.purgeInitialSweepCompletedAt,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.status, "purging"),
            eq(meetingSession.purgeClaimToken, input.executionToken),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return "continue" as const;
      }
      if (input.phase === "initial") {
        if (meeting.purgeInitialSweepCompletedAt) {
          return "continue" as const;
        }
        if (input.storageCleanupKeys.length > 0) {
          await tx
            .update(meetingStorageCleanupKey)
            .set({ initialSweepCompletedAt: now })
            .where(
              and(
                eq(meetingStorageCleanupKey.meetingId, input.meetingId),
                inArray(meetingStorageCleanupKey.storageKey, input.storageCleanupKeys),
              ),
            );
        }
        const [remaining] = await tx
          .select({ storageKey: meetingStorageCleanupKey.storageKey })
          .from(meetingStorageCleanupKey)
          .where(
            and(
              eq(meetingStorageCleanupKey.meetingId, input.meetingId),
              isNull(meetingStorageCleanupKey.initialSweepCompletedAt),
            ),
          )
          .limit(1);
        if (remaining) {
          await tx
            .update(meetingSession)
            .set({ purgeAfter: now, purgeClaimToken: null, purgeLeaseExpiresAt: null })
            .where(eq(meetingSession.id, input.meetingId));
          return "continue" as const;
        }
        await tx
          .update(meetingSession)
          .set({
            purgeAfter: new Date(now.getTime() + UPLOAD_QUIET_PERIOD_MS),
            purgeClaimToken: null,
            purgeInitialSweepCompletedAt: now,
            purgeLeaseExpiresAt: null,
          })
          .where(eq(meetingSession.id, input.meetingId));
        return "quiet-period" as const;
      }
      if (!meeting.purgeInitialSweepCompletedAt) {
        return "continue" as const;
      }
      if (input.storageCleanupKeys.length > 0) {
        await tx
          .update(meetingStorageCleanupKey)
          .set({ finalSweepCompletedAt: now })
          .where(
            and(
              eq(meetingStorageCleanupKey.meetingId, input.meetingId),
              inArray(meetingStorageCleanupKey.storageKey, input.storageCleanupKeys),
            ),
          );
      }
      const [remaining] = await tx
        .select({ storageKey: meetingStorageCleanupKey.storageKey })
        .from(meetingStorageCleanupKey)
        .where(
          and(
            eq(meetingStorageCleanupKey.meetingId, input.meetingId),
            isNull(meetingStorageCleanupKey.finalSweepCompletedAt),
          ),
        )
        .limit(1);
      if (remaining) {
        await tx
          .update(meetingSession)
          .set({ purgeAfter: now, purgeClaimToken: null, purgeLeaseExpiresAt: null })
          .where(eq(meetingSession.id, input.meetingId));
        return "continue" as const;
      }
      return "ready" as const;
    });
  }

  async function releaseMeetingPurgeClaim(
    input: MeetingPurgeJobData & {
      errorCode: string;
      executionToken: string;
      now?: Date;
    },
  ): Promise<boolean> {
    const now = input.now ?? new Date();
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ purgeInitialSweepCompletedAt: meetingSession.purgeInitialSweepCompletedAt })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.status, "purging"),
            eq(meetingSession.purgeClaimToken, input.executionToken),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return false;
      }
      const resetFinalSweep = Boolean(meeting.purgeInitialSweepCompletedAt);
      await tx
        .update(meetingSession)
        .set({
          purgeAfter: resetFinalSweep ? new Date(now.getTime() + UPLOAD_QUIET_PERIOD_MS) : now,
          purgeClaimToken: null,
          purgeLeaseExpiresAt: null,
        })
        .where(eq(meetingSession.id, input.meetingId));
      if (resetFinalSweep) {
        await tx
          .update(meetingStorageCleanupKey)
          .set({ finalSweepCompletedAt: null })
          .where(eq(meetingStorageCleanupKey.meetingId, input.meetingId));
      }
      await tx.insert(meetingAuditLog).values({
        action: "meeting.purge_failed",
        actorId: null,
        detail: { errorCode: input.errorCode },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return true;
    });
  }

  async function recordMeetingProviderPurgeOutcome(
    input: MeetingPurgeJobData & {
      executionToken: string;
      outcome: "deleted" | "failed" | "unsupported";
      processingRunId: string;
      provider: string;
      stage: string;
    },
  ): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.status, "purging"),
            eq(meetingSession.purgeClaimToken, input.executionToken),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return false;
      }
      const [run] = await tx
        .select({
          attempts: meetingProcessingRun.remoteArtifactPurgeAttempts,
          executionToken: meetingProcessingRun.remoteArtifactPurgeExecutionToken,
          status: meetingProcessingRun.remoteArtifactPurgeStatus,
        })
        .from(meetingProcessingRun)
        .where(
          and(
            eq(meetingProcessingRun.id, input.processingRunId),
            eq(meetingProcessingRun.meetingId, input.meetingId),
            eq(meetingProcessingRun.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!run) {
        return false;
      }
      if (run.executionToken === input.executionToken) {
        return run.status === "failed" && run.attempts < PROVIDER_PURGE_MAX_ATTEMPTS;
      }
      if (run.status === "deleted" || run.status === "unsupported") {
        return false;
      }
      const attempts = input.outcome === "failed" ? run.attempts + 1 : run.attempts;
      await tx
        .update(meetingProcessingRun)
        .set({
          remoteArtifactPurgeAttempts: attempts,
          remoteArtifactPurgeExecutionToken: input.executionToken,
          remoteArtifactPurgeStatus: input.outcome,
        })
        .where(eq(meetingProcessingRun.id, input.processingRunId));
      const retryable = input.outcome === "failed" && attempts < PROVIDER_PURGE_MAX_ATTEMPTS;
      await tx.insert(meetingAuditLog).values({
        action: "meeting.provider_artifact_purge",
        actorId: null,
        detail: {
          executionToken: input.executionToken,
          outcome: input.outcome,
          processingRunId: input.processingRunId,
          provider: input.provider,
          retryable,
          stage: input.stage,
        },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return retryable;
    });
  }

  async function finalizeMeetingPurge(
    input: MeetingPurgeJobData & {
      executionToken: string;
      providerCount: number;
      storageObjectCount: number;
    },
  ): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.meetingId}))`);
      const [meeting] = await tx
        .select({
          id: meetingSession.id,
          manifestSha256: meetingSession.manifestSha256,
          ownerId: meetingSession.ownerId,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.status, "purging"),
            eq(meetingSession.purgeClaimToken, input.executionToken),
            isNotNull(meetingSession.purgeInitialSweepCompletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return false;
      }
      const [remainingCleanupKey] = await tx
        .select({ storageKey: meetingStorageCleanupKey.storageKey })
        .from(meetingStorageCleanupKey)
        .where(
          and(
            eq(meetingStorageCleanupKey.meetingId, input.meetingId),
            isNull(meetingStorageCleanupKey.finalSweepCompletedAt),
          ),
        )
        .limit(1);
      if (remainingCleanupKey) {
        return false;
      }
      const [remainingProviderArtifact] = await tx
        .select({ id: meetingProcessingRun.id })
        .from(meetingProcessingRun)
        .where(
          and(
            eq(meetingProcessingRun.meetingId, input.meetingId),
            or(
              isNull(meetingProcessingRun.remoteArtifactPurgeStatus),
              and(
                eq(meetingProcessingRun.remoteArtifactPurgeStatus, "failed"),
                lt(meetingProcessingRun.remoteArtifactPurgeAttempts, PROVIDER_PURGE_MAX_ATTEMPTS),
              ),
            ),
          ),
        )
        .limit(1);
      if (remainingProviderArtifact) {
        return false;
      }
      await tx
        .delete(meetingQuestionThread)
        .where(eq(meetingQuestionThread.meetingId, input.meetingId));
      await tx
        .delete(meetingIntelligenceRevision)
        .where(eq(meetingIntelligenceRevision.meetingId, input.meetingId));
      await tx
        .delete(meetingProcessingRun)
        .where(
          and(
            eq(meetingProcessingRun.meetingId, input.meetingId),
            eq(meetingProcessingRun.stage, "meeting-intelligence"),
          ),
        );
      await tx
        .delete(meetingTranscriptRevision)
        .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
      await tx
        .delete(meetingProcessingRun)
        .where(eq(meetingProcessingRun.meetingId, input.meetingId));
      await tx.insert(meetingAuditLog).values({
        action: "meeting.purged",
        actorId: null,
        detail: {
          meetingId: input.meetingId,
          providerCount: input.providerCount,
          storageObjectCount: input.storageObjectCount,
        },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      await tx
        .insert(meetingPurgeTombstone)
        .values({
          manifestSha256: meeting.manifestSha256,
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          ownerId: meeting.ownerId,
        })
        .onConflictDoNothing({ target: meetingPurgeTombstone.meetingId });
      await tx.delete(meetingSession).where(eq(meetingSession.id, input.meetingId));
      return true;
    });
  }

  return {
    claimMeetingPurge,
    completeMeetingPurgeStorageBatch,
    continueMeetingPurgeProviderBatch,
    finalizeMeetingPurge,
    listRecoverableMeetingPurgeJobs,
    recordMeetingProviderPurgeOutcome,
    releaseMeetingPurgeClaim,
  };
}

export type MeetingPurgeClaim = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createMeetingPurgeDao>["claimMeetingPurge"]>>
>;
