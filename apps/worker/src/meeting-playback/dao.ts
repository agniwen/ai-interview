import { and, eq, inArray, or } from "drizzle-orm";
import {
  meetingRecordingAsset,
  meetingSession,
  meetingStorageCleanupKey,
} from "@arc/db-schema/schema";
import { db } from "../db";

// 只允许媒体库可见生命周期进入回放查询，排除 trashed/purging 等删除状态。 / Limits playback source queries to library lifecycle states, excluding deletion states such as trashed and purging.
const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

// 在组织范围内加载会议及全部音轨，并应用媒体库状态白名单。 / Loads the meeting and all tracks within organization scope while enforcing the library-state allowlist.
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

// 以持久化状态找出未开始或中断的混音，供启动/定时恢复重新入队。 / Finds not-started or interrupted mixes from persisted state for startup and periodic recovery.
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

// 通过允许状态的条件更新写入 processingRunId，作为后续发布/失败提交的 CAS 令牌。 / Conditionally writes processingRunId from allowed states, using it as the CAS token for publish or failure commits.
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

// 上传前登记对象键与 12 分钟写入租约，确保失败、竞争失败或清理流程能回收孤儿对象。 / Registers the object key and a 12-minute writer lease before upload so failures, lost races, or purge can reclaim orphaned data.
export async function registerMeetingPlaybackCleanupKey(input: {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
  storageKey: string;
}): Promise<{ writerLeaseExpiresAt: Date } | null> {
  const writerLeaseExpiresAt = new Date(Date.now() + 12 * 60 * 1000);
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({ id: meetingSession.id })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.processingRunId, input.processingRunId),
          eq(meetingSession.status, "processing"),
        ),
      )
      .for("share")
      .limit(1);
    if (!meeting) {
      return null;
    }
    await tx
      .insert(meetingStorageCleanupKey)
      .values({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        storageKey: input.storageKey,
        writerLeaseExpiresAt,
      })
      .onConflictDoUpdate({
        set: {
          finalSweepCompletedAt: null,
          initialSweepCompletedAt: null,
          writerLeaseExpiresAt,
        },
        target: meetingStorageCleanupKey.storageKey,
      });
    return { writerLeaseExpiresAt };
  });
}

// 对象已发布或物理删除后移除对应清理责任，且同时校验会议与组织范围。 / Retires cleanup responsibility only after publish or physical deletion, scoped to meeting and organization.
export async function removeMeetingPlaybackCleanupKey(input: {
  meetingId: string;
  organizationId: string;
  storageKey: string;
}): Promise<void> {
  await db
    .delete(meetingStorageCleanupKey)
    .where(
      and(
        eq(meetingStorageCleanupKey.meetingId, input.meetingId),
        eq(meetingStorageCleanupKey.organizationId, input.organizationId),
        eq(meetingStorageCleanupKey.storageKey, input.storageKey),
      ),
    );
}

// 仅当前 processingRunId 可提交失败并清空令牌；返回值决定调用方是否清理其上传对象。 / Only the current processingRunId may commit failure and clear the token; the result tells the caller whether to delete its upload.
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

// 先以 processingRunId 赢得发布权，再在同一事务 upsert playback 资源，失败的竞争者不能覆盖当前结果。 / Wins publication by processingRunId before upserting the playback asset in one transaction, preventing losing writers from overwriting current output.
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
