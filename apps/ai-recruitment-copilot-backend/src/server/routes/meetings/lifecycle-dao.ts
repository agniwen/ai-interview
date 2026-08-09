/* oxlint-disable max-lines -- lifecycle commands and the two-phase purge state machine share transactional invariants. */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingPurgeTombstone,
  meetingQuestionThread,
  meetingRecruitingContext,
  meetingRecordingAsset,
  meetingSearchProjection,
  meetingSession,
  meetingStorageCleanupKey,
  meetingTranscriptRevision,
  member,
  user,
} from "@arc/db-schema/schema";
import { MEETING_TRASH_RETENTION_MS } from "@arc/shared/meeting-recording";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import { rebuildMeetingSearchProjection } from "./routes/search/dao";

const TRASHABLE_STATUSES = [
  "uploading",
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;
const PURGE_LEASE_MS = 30 * 60 * 1000;
const PROVIDER_PURGE_BATCH_SIZE = 20;
const PURGE_STORAGE_BATCH_SIZE = 100;
const PROVIDER_PURGE_MAX_ATTEMPTS = 5;
const UPLOAD_AUTHORIZATION_DRAIN_MS = 61 * 60 * 1000;
const UPLOAD_QUIET_PERIOD_MS = 61 * 60 * 1000;

type LifecycleAuthorization = "administrator" | "owner" | "forbidden";

function lifecycleAuthorization(
  meeting: { custodianId: string | null; ownerId: string },
  currentMember: { role: string } | undefined,
  actorId: string,
): LifecycleAuthorization {
  if (!currentMember || currentMember.role === "noAccess") {
    return "forbidden";
  }
  if (currentMember.role === "owner" || currentMember.role === "admin") {
    return "administrator";
  }
  return (meeting.custodianId ?? meeting.ownerId) === actorId ? "owner" : "forbidden";
}

async function loadCurrentMember(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { actorId: string; organizationId: string },
) {
  const [currentMember] = await tx
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)))
    .for("share")
    .limit(1);
  return currentMember;
}

export async function trashMeetingSession(input: {
  actorId: string;
  meetingId: string;
  now?: Date;
  organizationId: string;
}): Promise<
  | { state: "forbidden" | "not-found" | "purging" }
  | { purgeAfter: Date; state: "already-trashed" | "trashed" }
> {
  const now = input.now ?? new Date();
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        custodianId: meetingSession.custodianId,
        ownerId: meetingSession.ownerId,
        purgeAfter: meetingSession.purgeAfter,
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
      return { state: "not-found" } as const;
    }
    const currentMember = await loadCurrentMember(tx, input);
    if (lifecycleAuthorization(meeting, currentMember, input.actorId) === "forbidden") {
      return { state: "forbidden" } as const;
    }
    if (meeting.status === "purging") {
      return { state: "purging" } as const;
    }
    if (meeting.status === "trashed" && meeting.purgeAfter) {
      return { purgeAfter: meeting.purgeAfter, state: "already-trashed" } as const;
    }
    if (!TRASHABLE_STATUSES.includes(meeting.status as (typeof TRASHABLE_STATUSES)[number])) {
      return { state: "not-found" } as const;
    }
    const purgeAfter = new Date(now.getTime() + MEETING_TRASH_RETENTION_MS);
    await tx
      .update(meetingSession)
      .set({
        purgeAfter,
        status: "trashed",
        trashedAt: now,
        trashedFromStatus: meeting.status,
      })
      .where(eq(meetingSession.id, input.meetingId));
    await Promise.all([
      tx
        .delete(meetingRecruitingContext)
        .where(eq(meetingRecruitingContext.meetingId, input.meetingId)),
      tx
        .delete(meetingSearchProjection)
        .where(eq(meetingSearchProjection.meetingId, input.meetingId)),
    ]);
    await tx.insert(meetingAuditLog).values({
      action: "meeting.trashed",
      actorId: input.actorId,
      detail: { previousStatus: meeting.status, purgeAfter: purgeAfter.toISOString() },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return { purgeAfter, state: "trashed" } as const;
  });
}

export async function listTrashedMeetingSessions(input: {
  actorId: string;
  organizationId: string;
}) {
  return await db.transaction(async (tx) => {
    const [currentMember] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)))
      .for("share")
      .limit(1);
    if (!currentMember || currentMember.role === "noAccess") {
      return [];
    }
    const administrator = currentMember.role === "owner" || currentMember.role === "admin";
    return tx
      .select({
        creatorId: user.id,
        creatorImage: user.image,
        creatorName: user.name,
        id: meetingSession.id,
        purgeAfter: meetingSession.purgeAfter,
        savedAt: meetingSession.savedAt,
        title: meetingSession.title,
        trashedAt: meetingSession.trashedAt,
      })
      .from(meetingSession)
      .innerJoin(user, eq(user.id, meetingSession.ownerId))
      .where(
        and(
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.status, "trashed"),
          administrator
            ? undefined
            : eq(
                sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`,
                input.actorId,
              ),
        ),
      )
      .orderBy(asc(meetingSession.purgeAfter));
  });
}

export async function restoreMeetingSession(input: {
  actorId: string;
  meetingId: string;
  now?: Date;
  organizationId: string;
}): Promise<{ state: "expired" | "forbidden" | "not-found" | "restored" }> {
  const now = input.now ?? new Date();
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        custodianId: meetingSession.custodianId,
        ownerId: meetingSession.ownerId,
        purgeAfter: meetingSession.purgeAfter,
        status: meetingSession.status,
        trashedFromStatus: meetingSession.trashedFromStatus,
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
    if (!meeting || meeting.status !== "trashed" || !meeting.trashedFromStatus) {
      return { state: "not-found" } as const;
    }
    const currentMember = await loadCurrentMember(tx, input);
    if (lifecycleAuthorization(meeting, currentMember, input.actorId) === "forbidden") {
      return { state: "forbidden" } as const;
    }
    if (!meeting.purgeAfter || meeting.purgeAfter.getTime() <= now.getTime()) {
      return { state: "expired" } as const;
    }
    await tx
      .update(meetingSession)
      .set({
        purgeAfter: null,
        purgeInitialSweepCompletedAt: null,
        status: meeting.trashedFromStatus,
        trashedAt: null,
        trashedFromStatus: null,
      })
      .where(eq(meetingSession.id, input.meetingId));
    await rebuildMeetingSearchProjection(tx, {
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    await tx.insert(meetingAuditLog).values({
      action: "meeting.restored",
      actorId: input.actorId,
      detail: { restoredStatus: meeting.trashedFromStatus },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return { state: "restored" } as const;
  });
}

export async function requestMeetingPurge(input: {
  actorId: string;
  localRecoveryCleanup?: "deleted" | "failed" | "not-reported";
  meetingId: string;
  now?: Date;
  organizationId: string;
}): Promise<{ state: "forbidden" | "not-found" | "purging" }> {
  const now = input.now ?? new Date();
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        custodianId: meetingSession.custodianId,
        ownerId: meetingSession.ownerId,
        status: meetingSession.status,
        trashedAt: meetingSession.trashedAt,
        trashedFromStatus: meetingSession.trashedFromStatus,
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
      return { state: "not-found" } as const;
    }
    const currentMember = await loadCurrentMember(tx, input);
    if (lifecycleAuthorization(meeting, currentMember, input.actorId) === "forbidden") {
      return { state: "forbidden" } as const;
    }
    if (meeting.status === "purging") {
      return { state: "purging" } as const;
    }
    if (
      meeting.status !== "trashed" &&
      !TRASHABLE_STATUSES.includes(meeting.status as (typeof TRASHABLE_STATUSES)[number])
    ) {
      return { state: "not-found" } as const;
    }
    const previousStatus = meeting.trashedFromStatus ?? meeting.status;
    // Upload authorizations can remain valid after a session advances beyond
    // `uploading`. Retain the purge graph until the longest authorization has
    // expired, then perform the final object sweep.
    const purgeAfter = new Date(now.getTime() + UPLOAD_AUTHORIZATION_DRAIN_MS);
    await tx
      .update(meetingSession)
      .set({
        purgeAfter,
        purgeClaimToken: null,
        purgeInitialSweepCompletedAt: null,
        purgeLeaseExpiresAt: null,
        status: "purging",
        trashedAt: meeting.trashedAt ?? now,
        trashedFromStatus: previousStatus,
      })
      .where(eq(meetingSession.id, input.meetingId));
    await Promise.all([
      tx
        .delete(meetingRecruitingContext)
        .where(eq(meetingRecruitingContext.meetingId, input.meetingId)),
      tx
        .delete(meetingSearchProjection)
        .where(eq(meetingSearchProjection.meetingId, input.meetingId)),
    ]);
    await tx.insert(meetingAuditLog).values({
      action: "meeting.purge_requested",
      actorId: input.actorId,
      detail: {
        purgeAfter: purgeAfter.toISOString(),
        requestingDeviceLocalRecoveryCleanup: input.localRecoveryCleanup ?? "not-reported",
      },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return { state: "purging" } as const;
  });
}

export async function loadMeetingLocalRecoveryDirective(input: {
  actorId: string;
  manifestSha256: string;
  meetingId: string;
}): Promise<"delete" | "retain"> {
  const [meeting, tombstone] = await Promise.all([
    db.query.meetingSession.findFirst({
      columns: { status: true },
      where: {
        id: input.meetingId,
        manifestSha256: input.manifestSha256,
        ownerId: input.actorId,
      },
    }),
    db.query.meetingPurgeTombstone.findFirst({
      columns: { meetingId: true },
      where: {
        manifestSha256: input.manifestSha256,
        meetingId: input.meetingId,
        ownerId: input.actorId,
      },
    }),
  ]);
  return meeting?.status === "purging" || tombstone ? "delete" : "retain";
}

export async function recordMeetingLocalRecoveryCleanup(input: {
  actorId: string;
  manifestSha256: string;
  meetingId: string;
  status: "deleted" | "failed";
}): Promise<"not-found" | "recorded"> {
  return await db.transaction(async (tx) => {
    const [meeting, tombstone] = await Promise.all([
      tx.query.meetingSession.findFirst({
        columns: { id: true, organizationId: true, status: true },
        where: {
          id: input.meetingId,
          manifestSha256: input.manifestSha256,
          ownerId: input.actorId,
        },
      }),
      tx.query.meetingPurgeTombstone.findFirst({
        columns: { meetingId: true, organizationId: true },
        where: {
          manifestSha256: input.manifestSha256,
          meetingId: input.meetingId,
          ownerId: input.actorId,
        },
      }),
    ]);
    const organizationId = meeting?.organizationId ?? tombstone?.organizationId;
    if (!(organizationId && (meeting?.status === "purging" || tombstone))) {
      return "not-found" as const;
    }
    await tx.insert(meetingAuditLog).values({
      action: "meeting.local_recovery_cleanup_reported",
      actorId: input.actorId,
      detail: {
        deviceReported: true,
        meetingId: input.meetingId,
        status: input.status,
      },
      id: crypto.randomUUID(),
      meetingId: meeting?.id ?? null,
      organizationId,
    });
    return "recorded" as const;
  });
}

export function listRecoverableMeetingPurgeJobs(now = new Date()): Promise<MeetingPurgeJobData[]> {
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

export interface MeetingPurgeClaim {
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

export async function claimMeetingPurge(
  input: MeetingPurgeJobData & { now?: Date },
): Promise<MeetingPurgeClaim | null> {
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
    if (!due || !leaseAvailable || (meeting.status !== "trashed" && meeting.status !== "purging")) {
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
        .orderBy(asc(meetingStorageCleanupKey.createdAt), asc(meetingStorageCleanupKey.storageKey))
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

export async function continueMeetingPurgeProviderBatch(
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

export async function completeMeetingPurgeStorageBatch(
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

export async function releaseMeetingPurgeClaim(
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

export async function recordMeetingProviderPurgeOutcome(
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

export async function finalizeMeetingPurge(
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
