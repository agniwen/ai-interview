/* oxlint-disable max-lines, class-methods-use-this -- The two-phase purge transaction keeps its lease and deletion invariants together; unsupported remote deletion is an explicit legacy terminal outcome. */
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
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
} from "@arc/db-schema/schema";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type {
  MeetingPurgeClaim,
  MeetingPurgeProcessorPorts,
} from "../background-workloads/processors/meeting-purge.processor.js";
import type { BackgroundObjectStorageService } from "./background-object-storage.service.js";

const PURGE_LEASE_MS = 30 * 60 * 1000;
const PROVIDER_BATCH_SIZE = 20;
const STORAGE_BATCH_SIZE = 100;
const PROVIDER_MAX_ATTEMPTS = 5;
const UPLOAD_QUIET_PERIOD_MS = 61 * 60 * 1000;

export class MeetingPurgeInfrastructure implements MeetingPurgeProcessorPorts {
  private readonly database: Database;
  private readonly storage: BackgroundObjectStorageService;

  constructor(database: Database, storage: BackgroundObjectStorageService) {
    this.database = database;
    this.storage = storage;
  }

  abortMultipartUpload(input: { storageKey: string; uploadId: string }) {
    return this.storage.abortMultipartUpload(input);
  }

  deleteStorageObject(storageKey: string) {
    return this.storage.delete(storageKey);
  }

  headStorageObject(storageKey: string) {
    return this.storage.head(storageKey);
  }

  deleteProviderArtifact(): Promise<"unsupported"> {
    // The migrated legacy provider registry has no remote-delete contract yet.
    // Persisting "unsupported" is the established terminal outcome and prevents
    // the artifact from being retried or silently treated as deleted.
    return Promise.resolve("unsupported");
  }

  claim(input: MeetingPurgeJobData): Promise<MeetingPurgeClaim | null> {
    const now = new Date();
    const executionToken = crypto.randomUUID();
    return this.database.transaction(async (tx) => {
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
      const due = meeting.purgeAfter && meeting.purgeAfter <= now;
      const leaseAvailable = !meeting.purgeLeaseExpiresAt || meeting.purgeLeaseExpiresAt <= now;
      if (!due || !leaseAvailable || !["trashed", "purging"].includes(meeting.status)) {
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
      const [assets, cleanupRows, providerRows] = await Promise.all([
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
            and(
              eq(meetingStorageCleanupKey.meetingId, input.meetingId),
              phase === "initial"
                ? isNull(meetingStorageCleanupKey.initialSweepCompletedAt)
                : isNull(meetingStorageCleanupKey.finalSweepCompletedAt),
            ),
          )
          .orderBy(
            asc(meetingStorageCleanupKey.createdAt),
            asc(meetingStorageCleanupKey.storageKey),
          )
          .limit(STORAGE_BATCH_SIZE + 1),
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
                  lt(meetingProcessingRun.remoteArtifactPurgeAttempts, PROVIDER_MAX_ATTEMPTS),
                ),
              ),
            ),
          )
          .orderBy(asc(meetingProcessingRun.startedAt), asc(meetingProcessingRun.id))
          .limit(PROVIDER_BATCH_SIZE + 1),
      ]);
      const hasMoreStorage = cleanupRows.length > STORAGE_BATCH_SIZE;
      const cleanupBatch = cleanupRows.slice(0, STORAGE_BATCH_SIZE);
      const providerAvailable = phase === "final" && !hasMoreStorage;
      const hasMoreProviderArtifacts =
        providerAvailable && providerRows.length > PROVIDER_BATCH_SIZE;
      const providerArtifacts = providerAvailable ? providerRows.slice(0, PROVIDER_BATCH_SIZE) : [];
      await tx.insert(meetingAuditLog).values({
        action: "meeting.purge_started",
        actorId: null,
        detail: { executionToken },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      const storageCleanupKeys = cleanupBatch.map((row) => row.storageKey);
      return {
        executionToken,
        hasMoreProviderArtifacts,
        multipartUploads: assets.flatMap((asset) =>
          asset.multipartUploadId && asset.status !== "ready"
            ? [{ storageKey: asset.storageKey, uploadId: asset.multipartUploadId }]
            : [],
        ),
        phase,
        providerArtifacts,
        storageCleanupKeys,
        storageKeys: [...new Set([...assets.map((row) => row.storageKey), ...storageCleanupKeys])],
      };
    });
  }

  completeStorageBatch(
    input: MeetingPurgeJobData & {
      executionToken: string;
      phase: "final" | "initial";
      storageCleanupKeys: string[];
    },
  ): Promise<"pending" | "ready"> {
    const now = new Date();
    return this.database.transaction(async (tx) => {
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
        return "pending";
      }
      const sweepColumn =
        input.phase === "initial"
          ? meetingStorageCleanupKey.initialSweepCompletedAt
          : meetingStorageCleanupKey.finalSweepCompletedAt;
      if (input.storageCleanupKeys.length > 0) {
        await tx
          .update(meetingStorageCleanupKey)
          .set(
            input.phase === "initial"
              ? { initialSweepCompletedAt: now }
              : { finalSweepCompletedAt: now },
          )
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
        .where(and(eq(meetingStorageCleanupKey.meetingId, input.meetingId), isNull(sweepColumn)))
        .limit(1);
      if (remaining) {
        await tx
          .update(meetingSession)
          .set({ purgeAfter: now, purgeClaimToken: null, purgeLeaseExpiresAt: null })
          .where(eq(meetingSession.id, input.meetingId));
        return "pending";
      }
      if (input.phase === "initial") {
        await tx
          .update(meetingSession)
          .set({
            purgeAfter: new Date(now.getTime() + UPLOAD_QUIET_PERIOD_MS),
            purgeClaimToken: null,
            purgeInitialSweepCompletedAt: now,
            purgeLeaseExpiresAt: null,
          })
          .where(eq(meetingSession.id, input.meetingId));
        return "pending";
      }
      if (!meeting.purgeInitialSweepCompletedAt) {
        await tx
          .update(meetingSession)
          .set({ purgeAfter: now, purgeClaimToken: null, purgeLeaseExpiresAt: null })
          .where(eq(meetingSession.id, input.meetingId));
        return "pending";
      }
      return "ready";
    });
  }

  async continueProviderBatch(
    input: MeetingPurgeJobData & { executionToken: string },
  ): Promise<boolean> {
    const [continued] = await this.database
      .update(meetingSession)
      .set({ purgeAfter: new Date(), purgeClaimToken: null, purgeLeaseExpiresAt: null })
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

  release(
    input: MeetingPurgeJobData & { errorCode: string; executionToken: string },
  ): Promise<boolean> {
    const now = new Date();
    return this.database.transaction(async (tx) => {
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
      await tx
        .update(meetingSession)
        .set({
          purgeAfter: meeting.purgeInitialSweepCompletedAt
            ? new Date(now.getTime() + UPLOAD_QUIET_PERIOD_MS)
            : now,
          purgeClaimToken: null,
          purgeLeaseExpiresAt: null,
        })
        .where(eq(meetingSession.id, input.meetingId));
      if (meeting.purgeInitialSweepCompletedAt) {
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

  recordProviderOutcome(
    input: Parameters<MeetingPurgeProcessorPorts["recordProviderOutcome"]>[0],
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
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
        return run.status === "failed" && run.attempts < PROVIDER_MAX_ATTEMPTS;
      }
      if (["deleted", "unsupported"].includes(run.status ?? "")) {
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
      const retryable = input.outcome === "failed" && attempts < PROVIDER_MAX_ATTEMPTS;
      await tx.insert(meetingAuditLog).values({
        action: "meeting.provider_artifact_purge",
        actorId: null,
        detail: { ...input, retryable },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      return retryable;
    });
  }

  finalize(
    input: MeetingPurgeJobData & {
      executionToken: string;
      providerCount: number;
      storageObjectCount: number;
    },
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
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
      const [remainingStorage] = await tx
        .select({ storageKey: meetingStorageCleanupKey.storageKey })
        .from(meetingStorageCleanupKey)
        .where(
          and(
            eq(meetingStorageCleanupKey.meetingId, input.meetingId),
            isNull(meetingStorageCleanupKey.finalSweepCompletedAt),
          ),
        )
        .limit(1);
      const [remainingProvider] = await tx
        .select({ id: meetingProcessingRun.id })
        .from(meetingProcessingRun)
        .where(
          and(
            eq(meetingProcessingRun.meetingId, input.meetingId),
            or(
              isNull(meetingProcessingRun.remoteArtifactPurgeStatus),
              and(
                eq(meetingProcessingRun.remoteArtifactPurgeStatus, "failed"),
                lt(meetingProcessingRun.remoteArtifactPurgeAttempts, PROVIDER_MAX_ATTEMPTS),
              ),
            ),
          ),
        )
        .limit(1);
      if (remainingStorage || remainingProvider) {
        return false;
      }
      await tx
        .delete(meetingQuestionThread)
        .where(eq(meetingQuestionThread.meetingId, input.meetingId));
      await tx
        .delete(meetingIntelligenceRevision)
        .where(eq(meetingIntelligenceRevision.meetingId, input.meetingId));
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
}
