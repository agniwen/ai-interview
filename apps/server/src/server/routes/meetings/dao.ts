import { and, asc, desc, eq, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import { db } from "../../../lib/server/db/index";
import type { JsonObject } from "@app/db-schema/json";
import {
  meetingAccessGrant,
  meetingAuditLog,
  meetingRecordingAsset,
  meetingProcessingRun,
  recruitingMeetingContext,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
  user,
} from "@app/db-schema/schema";
import type { MeetingGrantRole, UpdateMeetingShareInput } from "@app/shared/meeting-recording";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";
import { canonicalizeDeepgramLiveTranscriptDraft } from "@app/meeting-processing/transcription";
import { rebuildMeetingSearchProjection } from "./routes/search/dao";

export {
  createOrLoadMeetingSession,
  renewMeetingDirectUploadLease,
  resolveMeetingDirectUploadConcurrency,
} from "./capacity-dao";

const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;
const MEETING_GRANT_ROLES = new Set<string>(["editor", "viewer"]);
const DEEPGRAM_LIVE_PIPELINE_VERSION = "deepgram-live-v1";
const DEEPGRAM_LIVE_REGION = "global";

function isMeetingGrantRole(role: string): role is MeetingGrantRole {
  return MEETING_GRANT_ROLES.has(role);
}

function parseMeetingGrantRole(role: string | null): MeetingGrantRole | null {
  return role !== null && isMeetingGrantRole(role) ? role : null;
}

export function loadMeetingSession(id: string) {
  return db.query.meetingSession.findFirst({
    where: { id },
    with: { assets: true },
  });
}

export async function meetingAcceptsUploadAuthorization(input: {
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<boolean> {
  const meeting = await db.query.meetingSession.findFirst({
    columns: { id: true },
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      status: "uploading",
    },
  });
  return Boolean(meeting);
}

export async function isMeetingPurgeTombstoned(meetingId: string): Promise<boolean> {
  const tombstone = await db.query.meetingPurgeTombstone.findFirst({
    columns: { meetingId: true },
    where: { meetingId },
  });
  return Boolean(tombstone);
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
    const [meeting] = await tx
      .select({
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        liveTranscriptDraft: meetingSession.liveTranscriptDraft,
        manifestSha256: meetingSession.manifestSha256,
        startedAt: meetingSession.startedAt,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting) {
      return null;
    }
    await tx
      .update(meetingRecordingAsset)
      .set({ status: "ready", verifiedAt })
      .where(eq(meetingRecordingAsset.meetingId, input.meetingId));
    let promotedRevisionId: string | null = null;
    const draft = meetingLiveTranscriptDraftSchema.safeParse(meeting.liveTranscriptDraft);
    let unusableDeepgramDraft = false;
    if (draft.success && draft.data.provider === "deepgram" && draft.data.model) {
      const [existing] = await tx
        .select({ id: meetingTranscriptRevision.id })
        .from(meetingTranscriptRevision)
        .where(
          and(
            eq(meetingTranscriptRevision.meetingId, input.meetingId),
            eq(meetingTranscriptRevision.kind, "final"),
            eq(meetingTranscriptRevision.sourceManifestSha256, meeting.manifestSha256),
            eq(meetingTranscriptRevision.provider, "deepgram"),
            eq(meetingTranscriptRevision.model, draft.data.model),
            eq(meetingTranscriptRevision.region, DEEPGRAM_LIVE_REGION),
            eq(meetingTranscriptRevision.pipelineVersion, DEEPGRAM_LIVE_PIPELINE_VERSION),
          ),
        )
        .limit(1);
      promotedRevisionId = existing?.id ?? null;
      if (!promotedRevisionId) {
        const transcript = canonicalizeDeepgramLiveTranscriptDraft(draft.data, meeting.startedAt);
        if (transcript.turns.length === 0) {
          unusableDeepgramDraft = true;
        } else {
          const processingRunId = crypto.randomUUID();
          promotedRevisionId = crypto.randomUUID();
          const [latest] = await tx
            .select({ revision: max(meetingTranscriptRevision.revision) })
            .from(meetingTranscriptRevision)
            .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
          await tx.insert(meetingProcessingRun).values({
            attempt: 1,
            finishedAt: verifiedAt,
            id: processingRunId,
            idempotencyKey: [
              input.meetingId,
              meeting.manifestSha256,
              "deepgram",
              draft.data.model,
              DEEPGRAM_LIVE_REGION,
              DEEPGRAM_LIVE_PIPELINE_VERSION,
            ].join(":"),
            meetingId: input.meetingId,
            model: draft.data.model,
            organizationId: input.organizationId,
            pipelineVersion: DEEPGRAM_LIVE_PIPELINE_VERSION,
            provider: "deepgram",
            region: DEEPGRAM_LIVE_REGION,
            stage: "final-transcription",
            status: "succeeded",
          });
          await tx.insert(meetingTranscriptRevision).values({
            id: promotedRevisionId,
            kind: "final",
            language: transcript.language,
            meetingId: input.meetingId,
            model: draft.data.model,
            organizationId: input.organizationId,
            pipelineVersion: DEEPGRAM_LIVE_PIPELINE_VERSION,
            processingRunId,
            provider: "deepgram",
            region: DEEPGRAM_LIVE_REGION,
            revision: Number(latest?.revision ?? 0) + 1,
            sourceManifestSha256: meeting.manifestSha256,
          });
          if (transcript.turns.length > 0) {
            const revisionId = promotedRevisionId;
            await tx.insert(meetingTranscriptTurn).values(
              transcript.turns.map((turn, sequence) => ({
                ...turn,
                id: crypto.randomUUID(),
                revisionId,
                sequence,
              })),
            );
          }
        }
      }
    }
    const baseMeetingUpdate = {
      processingError: null,
      processingRunId: null,
      recoveryCopyDeleteAfter: sql`coalesce(${meetingSession.recoveryCopyDeleteAfter}, ${recoveryCopyDeleteAfter.toISOString()}::timestamptz)`,
      status: "processing",
      uploadLeaseExpiresAt: null,
      verifiedAt,
    };
    let meetingUpdate: typeof baseMeetingUpdate & {
      activeTranscriptRevisionId?: string;
      transcriptionError?: string | null;
      transcriptionRunId?: string | null;
      transcriptionStatus?: string;
    } = baseMeetingUpdate;
    if (promotedRevisionId) {
      meetingUpdate = {
        ...baseMeetingUpdate,
        activeTranscriptRevisionId: meeting.activeTranscriptRevisionId ?? promotedRevisionId,
        transcriptionError: null,
        transcriptionRunId: null,
        transcriptionStatus: "ready",
      };
    } else if (unusableDeepgramDraft) {
      meetingUpdate = {
        ...baseMeetingUpdate,
        transcriptionError: "Deepgram 实时转录没有产生可用的完整片段。",
        transcriptionRunId: null,
        transcriptionStatus: "failed",
      };
    }
    const [updated] = await tx
      .update(meetingSession)
      .set(meetingUpdate)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
        ),
      )
      .returning({ recoveryCopyDeleteAfter: meetingSession.recoveryCopyDeleteAfter });
    if (promotedRevisionId) {
      await rebuildMeetingSearchProjection(tx, input);
    }
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
  recruitingRecordId?: string;
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
    .leftJoin(
      recruitingMeetingContext,
      and(
        eq(recruitingMeetingContext.meetingId, meetingSession.id),
        eq(recruitingMeetingContext.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        access,
        inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES]),
        input.recruitingRecordId
          ? eq(recruitingMeetingContext.recruitingRecordId, input.recruitingRecordId)
          : undefined,
      ),
    )
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
        accessGrantRole: parseMeetingGrantRole(authorized.grantRole),
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

export async function recordMeetingAudit(input: {
  action: string;
  actorId: string;
  detail?: JsonObject;
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

export function renameMeetingSession(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
  title: string;
}): Promise<{ title: string } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ title: meetingSession.title })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES]),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) {
      return null;
    }
    if (current.title === input.title) {
      return { title: current.title };
    }
    const [updated] = await tx
      .update(meetingSession)
      .set({ title: input.title })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .returning({ title: meetingSession.title });
    if (!updated) {
      return null;
    }
    await rebuildMeetingSearchProjection(tx, {
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    await tx.insert(meetingAuditLog).values({
      action: "meeting.renamed",
      actorId: input.actorId,
      detail: { previousTitle: current.title, title: updated.title },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return updated;
  });
}
