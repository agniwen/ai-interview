import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAccessGrant,
  meetingAuditLog,
  meetingNote,
  meetingRecordingAsset,
  meetingSession,
  member,
  user,
} from "@arc/db-schema/schema";
import type {
  CreateMeetingNoteInput,
  CreateMultipartSavedMeetingInput,
  CreateSmallSavedMeetingInput,
  MeetingGrantRole,
  UpdateMeetingNoteInput,
  UpdateMeetingShareInput,
} from "@arc/shared/meeting-recording";

export type NewMeetingAsset = (
  | (CreateSmallSavedMeetingInput["assets"][number] & {
      multipartParts?: null;
      uploadMode?: "single";
    })
  | (CreateMultipartSavedMeetingInput["assets"][number] & {
      multipartParts: CreateMultipartSavedMeetingInput["assets"][number]["parts"];
      uploadMode: "multipart";
    })
) & {
  storageKey: string;
};

const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

function defaultMeetingTitle(startedAt: string): string {
  return `录制记录-${startedAt.slice(2, 16).replaceAll(/[-T:]/g, "")}`;
}

export function loadMeetingSession(id: string) {
  return db.query.meetingSession.findFirst({
    where: { id },
    with: { assets: true },
  });
}

export async function createOrLoadMeetingSession(input: {
  assets: NewMeetingAsset[];
  meeting: Omit<CreateSmallSavedMeetingInput, "assets" | "id"> & {
    id: string;
    organizationId: string;
    ownerId: string;
  };
}) {
  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(meetingSession)
      .values({
        id: input.meeting.id,
        manifestSha256: input.meeting.manifestSha256,
        organizationId: input.meeting.organizationId,
        ownerId: input.meeting.ownerId,
        savedAt: new Date(input.meeting.savedAt),
        startedAt: new Date(input.meeting.startedAt),
        status: "uploading",
        title: defaultMeetingTitle(input.meeting.startedAt),
      })
      .onConflictDoNothing({ target: meetingSession.id })
      .returning({ id: meetingSession.id });
    if (inserted.length === 0) {
      return false;
    }
    await tx.insert(meetingRecordingAsset).values(
      input.assets.map((asset) => ({
        contentType: asset.contentType,
        durationMs: asset.durationMs,
        fragmentCount: asset.fragmentCount,
        id: `${input.meeting.id}:${asset.track}`,
        meetingId: input.meeting.id,
        multipartParts: asset.multipartParts ?? null,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        status: "uploading",
        storageKey: asset.storageKey,
        track: asset.track,
        uploadMode: asset.uploadMode ?? "single",
      })),
    );
    return true;
  });
  return { created, meeting: await loadMeetingSession(input.meeting.id) };
}

export async function recordMeetingAssetMultipartUploadId(input: {
  assetId: string;
  uploadId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingRecordingAsset)
    .set({ multipartUploadId: input.uploadId })
    .where(
      and(
        eq(meetingRecordingAsset.id, input.assetId),
        isNull(meetingRecordingAsset.multipartUploadId),
      ),
    )
    .returning({ id: meetingRecordingAsset.id });
  return updated.length > 0;
}

export async function markMeetingSessionVerified(input: {
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<Date> {
  const verifiedAt = new Date();
  const recoveryCopyDeleteAfter = new Date(verifiedAt.getTime() + 24 * 60 * 60 * 1000);
  const persistedDeadline = await db.transaction(async (tx) => {
    await tx
      .update(meetingRecordingAsset)
      .set({ status: "ready", verifiedAt })
      .where(eq(meetingRecordingAsset.meetingId, input.meetingId));
    const [updated] = await tx
      .update(meetingSession)
      .set({
        processingError: null,
        processingRunId: null,
        recoveryCopyDeleteAfter: sql`coalesce(${meetingSession.recoveryCopyDeleteAfter}, ${recoveryCopyDeleteAfter})`,
        status: "processing",
        verifiedAt,
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
        ),
      )
      .returning({ recoveryCopyDeleteAfter: meetingSession.recoveryCopyDeleteAfter });
    return updated?.recoveryCopyDeleteAfter;
  });
  if (!persistedDeadline) {
    throw new Error("Meeting Session 验证状态未能持久化");
  }
  return persistedDeadline;
}

export async function listMeetingSessionsForAccess(input: {
  includeAllPrivateMeetings: boolean;
  organizationId: string;
  userId: string;
}) {
  const activeMember = await db.query.member.findFirst({
    columns: { id: true },
    where: { organizationId: input.organizationId, userId: input.userId },
  });
  const controllerId = sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`;
  const access = input.includeAllPrivateMeetings
    ? eq(meetingSession.organizationId, input.organizationId)
    : and(
        eq(meetingSession.organizationId, input.organizationId),
        or(
          eq(controllerId, input.userId),
          eq(meetingSession.visibility, "workspace"),
          isNotNull(meetingAccessGrant.id),
        ),
      );
  return db
    .select({
      controllerId,
      creatorId: user.id,
      creatorImage: user.image,
      creatorName: user.name,
      durationMs: sql<number>`coalesce(max(${meetingRecordingAsset.durationMs}) filter (where ${meetingRecordingAsset.track} in ('microphone', 'system')), 0)`,
      grantRole: meetingAccessGrant.role,
      id: meetingSession.id,
      recordingAvailable: sql<boolean>`coalesce(bool_or(${meetingRecordingAsset.track} = 'playback' and ${meetingRecordingAsset.status} = 'ready'), false)`,
      savedAt: meetingSession.savedAt,
      status: meetingSession.status,
      title: meetingSession.title,
      visibility: meetingSession.visibility,
      workspaceCustodied: sql<boolean>`not exists (
        select 1 from ${member}
        where ${member.organizationId} = ${meetingSession.organizationId}
          and ${member.userId} = ${controllerId}
      )`,
    })
    .from(meetingSession)
    .innerJoin(user, eq(user.id, meetingSession.ownerId))
    .leftJoin(meetingRecordingAsset, eq(meetingRecordingAsset.meetingId, meetingSession.id))
    .leftJoin(
      meetingAccessGrant,
      and(
        eq(meetingAccessGrant.meetingId, meetingSession.id),
        eq(meetingAccessGrant.organizationId, input.organizationId),
        activeMember ? eq(meetingAccessGrant.memberId, activeMember.id) : sql`false`,
      ),
    )
    .where(and(access, inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES])))
    .groupBy(
      meetingSession.id,
      meetingSession.custodianId,
      meetingSession.ownerId,
      meetingSession.title,
      meetingSession.savedAt,
      meetingSession.status,
      meetingSession.visibility,
      meetingAccessGrant.role,
      user.id,
      user.name,
      user.image,
    )
    .orderBy(desc(meetingSession.savedAt));
}

export async function loadMeetingSessionForAccess(input: {
  includeAllPrivateMeetings: boolean;
  meetingId: string;
  organizationId: string;
  userId: string;
}) {
  const activeMember = await db.query.member.findFirst({
    columns: { id: true },
    where: { organizationId: input.organizationId, userId: input.userId },
  });
  const controllerId = sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`;
  const [authorized] = await db
    .select({
      grantRole: meetingAccessGrant.role,
      workspaceCustodied: sql<boolean>`not exists (
        select 1 from ${member}
        where ${member.organizationId} = ${meetingSession.organizationId}
          and ${member.userId} = ${controllerId}
      )`,
    })
    .from(meetingSession)
    .leftJoin(
      meetingAccessGrant,
      and(
        eq(meetingAccessGrant.meetingId, meetingSession.id),
        eq(meetingAccessGrant.organizationId, input.organizationId),
        activeMember ? eq(meetingAccessGrant.memberId, activeMember.id) : sql`false`,
      ),
    )
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES]),
        input.includeAllPrivateMeetings
          ? undefined
          : or(
              eq(controllerId, input.userId),
              eq(meetingSession.visibility, "workspace"),
              isNotNull(meetingAccessGrant.id),
            ),
      ),
    )
    .limit(1);
  if (!authorized) {
    return null;
  }
  const meeting = await db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      status: { in: [...LIBRARY_MEETING_STATUSES] },
    },
    with: { assets: true, custodian: true, owner: true },
  });
  return meeting
    ? {
        ...meeting,
        accessGrantRole: authorized.grantRole as MeetingGrantRole | null,
        workspaceCustodied: authorized.workspaceCustodied,
      }
    : null;
}

export function listMeetingAccessGrants(input: { meetingId: string; organizationId: string }) {
  return db
    .select({
      image: user.image,
      name: user.name,
      role: meetingAccessGrant.role,
      userId: member.userId,
    })
    .from(meetingAccessGrant)
    .innerJoin(
      member,
      and(
        eq(member.id, meetingAccessGrant.memberId),
        eq(member.organizationId, input.organizationId),
      ),
    )
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(meetingAccessGrant.meetingId, input.meetingId),
        eq(meetingAccessGrant.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(user.name));
}

export async function replaceMeetingAccessGrants(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
  ownerId: string;
  share: UpdateMeetingShareInput;
}): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const userIds = input.share.grants.map((grant) => grant.userId);
    const memberIds = new Map<string, string>();
    if (userIds.includes(input.ownerId)) {
      return false;
    }
    if (userIds.length > 0) {
      const members = await tx
        .select({ id: member.id, userId: member.userId })
        .from(member)
        .where(
          and(eq(member.organizationId, input.organizationId), inArray(member.userId, userIds)),
        );
      if (members.length !== userIds.length) {
        return false;
      }
      for (const workspaceMember of members) {
        memberIds.set(workspaceMember.userId, workspaceMember.id);
      }
    }
    const [updated] = await tx
      .update(meetingSession)
      .set({ visibility: input.share.visibility })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(
            sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`,
            input.ownerId,
          ),
        ),
      )
      .returning({ id: meetingSession.id });
    if (!updated) {
      return false;
    }
    await tx
      .delete(meetingAccessGrant)
      .where(
        and(
          eq(meetingAccessGrant.meetingId, input.meetingId),
          eq(meetingAccessGrant.organizationId, input.organizationId),
        ),
      );
    if (input.share.grants.length > 0) {
      const memberIdFor = (userId: string): string => {
        const memberId = memberIds.get(userId);
        if (!memberId) {
          throw new Error("Workspace member disappeared while updating meeting access");
        }
        return memberId;
      };
      await tx.insert(meetingAccessGrant).values(
        input.share.grants.map((grant) => ({
          createdBy: input.actorId,
          id: crypto.randomUUID(),
          meetingId: input.meetingId,
          memberId: memberIdFor(grant.userId),
          organizationId: input.organizationId,
          role: grant.role,
        })),
      );
    }
    await tx.insert(meetingAuditLog).values({
      action: "meeting.share_updated",
      actorId: input.actorId,
      detail: { grants: input.share.grants, visibility: input.share.visibility },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return true;
  });
}

export async function reassignMeetingOwner(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
  userId: string;
}): Promise<"invalid-member" | "not-custodied" | "updated"> {
  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        custodianId: meetingSession.custodianId,
        ownerId: meetingSession.ownerId,
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
    if (!current) {
      return "invalid-member";
    }
    const previousOwnerId = current.custodianId ?? current.ownerId;
    const currentController = await tx.query.member.findFirst({
      columns: { id: true },
      where: { organizationId: input.organizationId, userId: previousOwnerId },
    });
    if (currentController) {
      return "not-custodied";
    }
    const target = await tx.query.member.findFirst({
      where: { organizationId: input.organizationId, userId: input.userId },
    });
    if (!target) {
      return "invalid-member";
    }
    const [updated] = await tx
      .update(meetingSession)
      .set({ custodianId: input.userId })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .returning({ id: meetingSession.id });
    if (!updated) {
      return "invalid-member";
    }
    await tx
      .delete(meetingAccessGrant)
      .where(
        and(
          eq(meetingAccessGrant.meetingId, input.meetingId),
          eq(meetingAccessGrant.memberId, target.id),
        ),
      );
    await tx.insert(meetingAuditLog).values({
      action: "meeting.owner_reassigned",
      actorId: input.actorId,
      detail: {
        previousOwnerId,
        userId: input.userId,
      },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return "updated";
  });
}

export function listMeetingNotes(input: { meetingId: string; organizationId: string }) {
  return db
    .select()
    .from(meetingNote)
    .where(
      and(
        eq(meetingNote.meetingId, input.meetingId),
        eq(meetingNote.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(meetingNote.meetingTimeMs), asc(meetingNote.createdAt));
}

export async function createMeetingNote(input: {
  authorId: string;
  authorName: string;
  meetingId: string;
  note: CreateMeetingNoteInput;
  organizationId: string;
}) {
  const [created] = await db
    .insert(meetingNote)
    .values({
      authorId: input.authorId,
      authorName: input.authorName,
      body: input.note.body,
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      meetingTimeMs: input.note.meetingTimeMs,
      organizationId: input.organizationId,
    })
    .returning();
  return created;
}

export async function updateMeetingNote(input: {
  actorId: string;
  canEditAll: boolean;
  canGovern: boolean;
  meetingId: string;
  note: UpdateMeetingNoteInput;
  noteId: string;
  organizationId: string;
}) {
  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(meetingNote)
      .set(input.note)
      .where(
        and(
          eq(meetingNote.id, input.noteId),
          eq(meetingNote.meetingId, input.meetingId),
          eq(meetingNote.organizationId, input.organizationId),
          input.canEditAll ? undefined : sql`false`,
        ),
      )
      .returning();
    if (!updated) {
      return null;
    }
    if (input.canGovern && updated.authorId !== input.actorId) {
      await tx.insert(meetingAuditLog).values({
        action: "meeting.note_governed",
        actorId: input.actorId,
        detail: {
          noteId: input.noteId,
          operation: "updated",
          originalAuthorId: updated.authorId,
        },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    }
    return updated;
  });
}

export async function recordMeetingAudit(input: {
  action: string;
  actorId: string;
  detail?: Record<string, unknown>;
  dedupeWithinMs?: number;
  meetingId?: string;
  organizationId: string;
}): Promise<void> {
  if (input.dedupeWithinMs) {
    const recent = await db.query.meetingAuditLog.findFirst({
      where: {
        action: input.action,
        actorId: input.actorId,
        createdAt: { gt: new Date(Date.now() - input.dedupeWithinMs) },
        meetingId: input.meetingId ?? { isNull: true },
        organizationId: input.organizationId,
      },
    });
    if (recent) {
      return;
    }
  }
  await db.insert(meetingAuditLog).values({
    action: input.action,
    actorId: input.actorId,
    detail: input.detail ?? {},
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
}

export async function deleteMeetingNote(input: {
  canGovern: boolean;
  meetingId: string;
  noteId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(meetingNote)
      .where(
        and(
          eq(meetingNote.id, input.noteId),
          eq(meetingNote.meetingId, input.meetingId),
          eq(meetingNote.organizationId, input.organizationId),
          input.canGovern ? undefined : eq(meetingNote.authorId, input.userId),
        ),
      )
      .returning({ authorId: meetingNote.authorId });
    if (!deleted) {
      return false;
    }
    if (input.canGovern && deleted.authorId !== input.userId) {
      await tx.insert(meetingAuditLog).values({
        action: "meeting.note_governed",
        actorId: input.userId,
        detail: { noteId: input.noteId },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    }
    return true;
  });
}

export function loadMeetingPlaybackSource(input: { meetingId: string; organizationId: string }) {
  return db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      status: { in: [...LIBRARY_MEETING_STATUSES] },
    },
    with: { assets: true },
  });
}

export async function listRecoverableMeetingPlaybackJobs(): Promise<
  { meetingId: string; organizationId: string }[]
> {
  const jobs = await db
    .select({ meetingId: meetingSession.id, organizationId: meetingSession.organizationId })
    .from(meetingSession)
    .where(
      or(eq(meetingSession.status, "workspace-verified"), eq(meetingSession.status, "processing")),
    );
  return jobs;
}

export async function markMeetingPlaybackProcessing(input: {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingSession)
    .set({
      processingError: null,
      processingRunId: input.processingRunId,
      status: "processing",
    })
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        inArray(meetingSession.status, ["workspace-verified", "processing", "processing-failed"]),
      ),
    )
    .returning({ id: meetingSession.id });
  return updated.length > 0;
}

export async function markMeetingPlaybackFailed(input: {
  errorMessage: string;
  meetingId: string;
  organizationId: string;
  processingRunId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingSession)
    .set({
      processingError: input.errorMessage.slice(0, 1000),
      processingRunId: null,
      status: "processing-failed",
    })
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        eq(meetingSession.processingRunId, input.processingRunId),
        eq(meetingSession.status, "processing"),
      ),
    )
    .returning({ id: meetingSession.id });
  return updated.length > 0;
}

export async function publishMeetingPlaybackAsset(input: {
  contentType: string;
  durationMs: number;
  meetingId: string;
  organizationId: string;
  processingRunId: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<boolean> {
  const verifiedAt = new Date();
  return await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(meetingSession)
      .set({ processingError: null, processingRunId: null, status: "ready" })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.processingRunId, input.processingRunId),
          eq(meetingSession.status, "processing"),
        ),
      )
      .returning({ id: meetingSession.id });
    if (!claimed) {
      return false;
    }
    await tx
      .insert(meetingRecordingAsset)
      .values({
        contentType: input.contentType,
        durationMs: input.durationMs,
        fragmentCount: 0,
        id: `${input.meetingId}:playback`,
        meetingId: input.meetingId,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        status: "ready",
        storageKey: input.storageKey,
        track: "playback",
        uploadMode: "derived",
        verifiedAt,
      })
      .onConflictDoUpdate({
        set: {
          contentType: input.contentType,
          durationMs: input.durationMs,
          sha256: input.sha256,
          sizeBytes: input.sizeBytes,
          status: "ready",
          storageKey: input.storageKey,
          uploadMode: "derived",
          verifiedAt,
        },
        target: [meetingRecordingAsset.meetingId, meetingRecordingAsset.track],
      });
    return true;
  });
}
