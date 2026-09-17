import type { meetingSession, meetingPurgeTombstone, member } from "@app/db-schema/schema";
import { createMeetingPurgeDao } from "@app/meeting-processing/purge";
import {
  abortMeetingRecordingMultipartUpload,
  deleteMeetingRecordingObject,
  headMeetingRecordingObject,
} from "@app/object-storage";
import { db } from "../../../../../lib/server/db";
import { requestMeetingPurge } from "../../lifecycle-dao";
import { EchoProcessingError } from "./error";
import type { EchoContextInput } from "./context-dao";

const purge = createMeetingPurgeDao(db, "device");

function deletionPhase(
  meeting: typeof meetingSession.$inferSelect | undefined,
  deleted: boolean,
): "deleted" | "purging" | "retained" {
  if (deleted) {
    return "deleted";
  }
  if (meeting?.status === "purging") {
    return "purging";
  }
  if (meeting?.status === "trashed" && meeting.purgeAfter && meeting.purgeAfter <= new Date()) {
    return "purging";
  }
  return "retained";
}
async function deletionAccess(
  input: EchoContextInput,
  meeting: typeof meetingSession.$inferSelect | undefined,
  tombstone: typeof meetingPurgeTombstone.$inferSelect | undefined,
  membership: Pick<typeof member.$inferSelect, "id" | "role"> | undefined,
) {
  if (!membership) {
    throw new EchoProcessingError(403, "无权查看此录音的删除状态");
  }
  if (meeting?.processingOwner === "worker") {
    throw new EchoProcessingError(409, "此录音不由 Echo 处理");
  }
  const controller = meeting ? (meeting.custodianId ?? meeting.ownerId) : tombstone?.ownerId;
  const canAdvance =
    controller === input.userId || membership.role === "owner" || membership.role === "admin";
  if (canAdvance || tombstone || meeting?.visibility === "workspace") {
    return canAdvance;
  }
  const grant = await db.query.meetingAccessGrant.findFirst({
    columns: { role: true },
    where: { meetingId: input.meetingId, memberId: membership.id },
  });
  if (!grant) {
    throw new EchoProcessingError(403, "无权查看此录音的删除状态");
  }
  return false;
}

export async function getEchoDeletionState(input: EchoContextInput) {
  const [meeting, tombstone, membership] = await Promise.all([
    db.query.meetingSession.findFirst({
      where: { id: input.meetingId, organizationId: input.organizationId },
    }),
    db.query.meetingPurgeTombstone.findFirst({
      where: { meetingId: input.meetingId, organizationId: input.organizationId },
    }),
    db.query.member.findFirst({
      columns: { id: true, role: true },
      where: { organizationId: input.organizationId, userId: input.userId },
    }),
  ]);
  if (!meeting && !tombstone) {
    throw new EchoProcessingError(404, "录音不存在");
  }
  const canAdvance = await deletionAccess(input, meeting, tombstone, membership);
  return {
    canAdvance,
    manifestSha256: meeting?.manifestSha256 ?? tombstone?.manifestSha256 ?? "",
    nextAttemptAt: meeting?.purgeAfter?.toISOString() ?? new Date().toISOString(),
    state: deletionPhase(meeting, Boolean(tombstone)),
  };
}

export async function requestEchoDeletion(input: EchoContextInput) {
  const current = await getEchoDeletionState(input);
  if (!current.canAdvance) {
    throw new EchoProcessingError(403, "无权永久删除此录音");
  }
  if (current.state !== "retained") {
    return current;
  }
  const result = await requestMeetingPurge({ ...input, actorId: input.userId });
  if (result.state !== "purging") {
    throw new EchoProcessingError(result.state === "forbidden" ? 403 : 404, "无法永久删除此录音");
  }
  return getEchoDeletionState(input);
}

async function storageBatch<T, Result>(items: T[], operation: (item: T) => Promise<Result>) {
  for (let offset = 0; offset < items.length; offset += 8) {
    const results = await Promise.allSettled(items.slice(offset, offset + 8).map(operation));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("录音存储清理失败");
    }
  }
}

/** Each request advances one bounded DAO batch; Desktop owns scheduling and retry. */
export async function advanceEchoDeletion(input: EchoContextInput) {
  const current = await getEchoDeletionState(input);
  if (!current.canAdvance) {
    throw new EchoProcessingError(403, "无权永久删除此录音");
  }
  if (current.state !== "purging") {
    return current;
  }
  const claim = await purge.claimMeetingPurge(input);
  if (!claim) {
    return current;
  }
  const owned = { ...input, executionToken: claim.executionToken };
  try {
    await storageBatch(claim.multipartUploads, abortMeetingRecordingMultipartUpload);
    await storageBatch(claim.storageKeys, deleteMeetingRecordingObject);
    if (claim.phase === "final") {
      await storageBatch(claim.storageKeys, async (storageKey) => {
        if (await headMeetingRecordingObject(storageKey)) {
          throw new Error("录音对象仍然存在");
        }
      });
    }
    const state = await purge.completeMeetingPurgeStorageBatch({
      ...owned,
      phase: claim.phase,
      storageCleanupKeys: claim.storageCleanupKeys,
    });
    if (state !== "ready") {
      return getEchoDeletionState(input);
    }
    // Existing providers expose no delete API. Preserve the explicit unsupported audit outcome.
    for (const artifact of claim.providerArtifacts) {
      await purge.recordMeetingProviderPurgeOutcome({
        ...owned,
        ...artifact,
        outcome: "unsupported",
      });
    }
    await (claim.hasMoreProviderArtifacts
      ? purge.continueMeetingPurgeProviderBatch(owned)
      : purge.finalizeMeetingPurge({
          ...owned,
          providerCount: claim.providerArtifacts.length,
          storageObjectCount: claim.storageKeys.length,
        }));
    return getEchoDeletionState(input);
  } catch (error) {
    await purge.releaseMeetingPurgeClaim({ ...owned, errorCode: "meeting-purge-failed" });
    throw error;
  }
}
