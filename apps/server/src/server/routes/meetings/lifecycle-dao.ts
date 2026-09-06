/* oxlint-disable max-lines -- lifecycle commands and the two-phase purge state machine share transactional invariants. */
import { and, asc, count, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import {
  assertMeetingRecruitingReferences,
  createMeetingPurgeDao,
} from "@app/meeting-processing/purge";
import { buildOrderBy } from "../../../lib/server/db/pagination";
import { db } from "../../../lib/server/db/index";
import {
  meetingAuditLog,
  recruitingMeetingContext,
  meetingSearchProjection,
  meetingSession,
  member,
  user,
} from "@app/db-schema/schema";
import { MEETING_TRASH_RETENTION_MS } from "@app/shared/meeting-recording";
import type { TrashedMeetingListQuery } from "@app/shared/meeting-recording";
import { paginationOffset } from "@app/shared/pagination";
import {
  hasMeetingDirectUploadCapacity,
  lockMeetingDirectUploadCapacity,
  meetingDirectUploadLeaseExpiresAt,
} from "./capacity-dao";
import { rebuildMeetingSearchProjection } from "./routes/search/dao";

const TRASHABLE_STATUSES = [
  "uploading",
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;
const UPLOAD_AUTHORIZATION_DRAIN_MS = 61 * 60 * 1000;

function isTrashableStatus(status: string): status is (typeof TRASHABLE_STATUSES)[number] {
  return TRASHABLE_STATUSES.some((candidate) => candidate === status);
}

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

// Locks the meeting before authorization, removes it from recruiting/search projections, and records the retention deadline for later purge.
// 授权判断前锁定会议，将其移出招聘与搜索投影，并记录后续清理的保留期限。
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
    if (!isTrashableStatus(meeting.status)) {
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
        .delete(recruitingMeetingContext)
        .where(eq(recruitingMeetingContext.meetingId, input.meetingId)),
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

const TRASH_SORT_COLUMNS = {
  savedAt: meetingSession.savedAt,
  title: meetingSession.title,
  trashedAt: meetingSession.trashedAt,
} as const;

// Owners and admins see the workspace trash; other members only see meetings they own or custodize.
// 所有者与管理员可查看工作区回收站，其他成员仅能查看自己拥有或托管的会议。
export async function listTrashedMeetingSessions(
  input: {
    actorId: string;
    organizationId: string;
  } & TrashedMeetingListQuery,
) {
  return await db.transaction(async (tx) => {
    const [currentMember] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)))
      .for("share")
      .limit(1);
    if (!currentMember || currentMember.role === "noAccess") {
      return { records: [], total: 0 };
    }
    const administrator = currentMember.role === "owner" || currentMember.role === "admin";
    const search = input.search.trim();
    const where = and(
      eq(meetingSession.organizationId, input.organizationId),
      eq(meetingSession.status, "trashed"),
      isNotNull(meetingSession.purgeAfter),
      isNotNull(meetingSession.trashedAt),
      administrator
        ? undefined
        : eq(
            sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`,
            input.actorId,
          ),
      search ? ilike(meetingSession.title, `%${search}%`) : undefined,
    );
    const [totalRow] = await tx
      .select({ value: count() })
      .from(meetingSession)
      .innerJoin(user, eq(user.id, meetingSession.ownerId))
      .where(where);
    const idOrder = input.sortOrder === "asc" ? asc(meetingSession.id) : desc(meetingSession.id);
    const records = await tx
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
      .where(where)
      .orderBy(buildOrderBy(TRASH_SORT_COLUMNS, input.sortBy, input.sortOrder), idOrder)
      .limit(input.pageSize)
      .offset(paginationOffset(input.page, input.pageSize));
    return { records, total: Number(totalRow?.value ?? 0) };
  });
}

export async function restoreMeetingSession(input: {
  actorId: string;
  meetingId: string;
  now?: Date;
  organizationId: string;
}): Promise<{ state: "capacity" | "expired" | "forbidden" | "not-found" | "restored" }> {
  const now = input.now ?? new Date();
  return await db.transaction(async (tx) => {
    await lockMeetingDirectUploadCapacity(tx);
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
    if (
      meeting.trashedFromStatus === "uploading" &&
      !(await hasMeetingDirectUploadCapacity(tx, {
        excludeMeetingId: input.meetingId,
        now,
      }))
    ) {
      return { state: "capacity" } as const;
    }
    await tx
      .update(meetingSession)
      .set({
        purgeAfter: null,
        purgeInitialSweepCompletedAt: null,
        status: meeting.trashedFromStatus,
        trashedAt: null,
        trashedFromStatus: null,
        uploadLeaseExpiresAt:
          meeting.trashedFromStatus === "uploading" ? meetingDirectUploadLeaseExpiresAt(now) : null,
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

// Moves a meeting into the purge graph but delays object deletion until outstanding upload authorizations have expired.
// 将会议转入清理流程，但会等待未过期的上传授权失效后再删除对象。
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
    await assertMeetingRecruitingReferences(tx, input.meetingId);
    if (meeting.status === "purging") {
      return { state: "purging" } as const;
    }
    if (meeting.status !== "trashed" && !isTrashableStatus(meeting.status)) {
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
        .delete(recruitingMeetingContext)
        .where(eq(recruitingMeetingContext.meetingId, input.meetingId)),
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

// Tells a recording device to delete local recovery data once either the live row or its tombstone proves purge intent.
// 当活动记录或 tombstone 已确认清理意图时，通知录制设备删除本地恢复数据。
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

export const {
  claimMeetingPurge,
  completeMeetingPurgeStorageBatch,
  continueMeetingPurgeProviderBatch,
  finalizeMeetingPurge,
  listRecoverableMeetingPurgeJobs,
  recordMeetingProviderPurgeOutcome,
  releaseMeetingPurgeClaim,
} = createMeetingPurgeDao(db);
