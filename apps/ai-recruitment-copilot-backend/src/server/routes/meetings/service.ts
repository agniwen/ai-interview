import { createHash } from "node:crypto";
import {
  abortMeetingRecordingMultipartUpload,
  buildMeetingRecordingAssetKey,
  completeMeetingRecordingMultipartUpload,
  createMeetingRecordingMultipartUpload,
  headMeetingRecordingObject,
  listMeetingRecordingUploadParts,
  presignMeetingRecordingPutObject,
  presignMeetingRecordingUploadPart,
  presignRecordingGetObjectUrl,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-playback";
import {
  createOrLoadMeetingSession,
  isMeetingPurgeTombstoned,
  listMeetingSessionsForAccess,
  loadMeetingSession,
  markMeetingSessionVerified,
  meetingAcceptsUploadAuthorization,
  recordMeetingAudit,
  recordMeetingAssetMultipartUploadId,
} from "./dao";
import type {
  CreateMultipartSavedMeetingInput,
  CreateSmallSavedMeetingInput,
  MeetingAccessRole,
  MeetingDetail,
  MeetingGrantRole,
  MeetingLibraryItem,
  MeetingPlaybackAuthorization,
  MeetingProcessingState,
  MeetingSourceTrack,
  MultipartSavedMeetingResponse,
  SmallSavedMeetingResponse,
} from "@arc/shared/meeting-recording";
import {
  isWorkspaceAdministrator,
  meetingAccessCapabilities,
  resolveMeetingAccessRole,
} from "./access";
import { loadAuthorizedMeeting, meetingRole } from "./authorized-meeting";

const SERVER_VERIFIED_STATUSES = new Set([
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
]);
const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

function sourceAssets<T extends { track: string }>(assets: T[]): T[] {
  return assets.filter((asset) => asset.track === "microphone" || asset.track === "system");
}

function processingState(status: string): MeetingProcessingState {
  if (status === "ready") {
    return "ready";
  }
  if (status === "processing-failed") {
    return "failed";
  }
  return "processing";
}

function shouldAutomaticallyEnqueuePlayback(status: string): boolean {
  return status === "workspace-verified" || status === "processing";
}

function isMeetingLifecycleUnavailable(status: string): boolean {
  return status === "trashed" || status === "purging";
}

async function enqueueMeetingPlaybackBestEffort(input: {
  meetingId: string;
  organizationId: string;
}): Promise<void> {
  try {
    await enqueueMeetingPlaybackJobs([input]);
  } catch (error) {
    console.error("[meeting-playback] enqueue failed; startup recovery will retry", {
      error,
      meetingId: input.meetingId,
    });
  }
}

type CreateResult =
  | { code?: "meeting-purged"; conflict: true; message: string }
  | (SmallSavedMeetingResponse & { created: boolean });

function ownsMeeting(
  meeting: NonNullable<Awaited<ReturnType<typeof loadMeetingSession>>>,
  input: { manifestSha256: string; organizationId: string; ownerId: string },
): boolean {
  return (
    meeting.organizationId === input.organizationId &&
    meeting.ownerId === input.ownerId &&
    meeting.manifestSha256 === input.manifestSha256
  );
}

export async function createSmallSavedMeeting(input: {
  input: CreateSmallSavedMeetingInput;
  organizationId: string;
  ownerId: string;
}): Promise<CreateResult> {
  const assets = await Promise.all(
    input.input.assets.map(async (asset) => ({
      ...asset,
      storageKey: await buildMeetingRecordingAssetKey({
        meetingId: input.input.id,
        organizationId: input.organizationId,
        track: asset.track,
      }),
    })),
  );
  const { blockedByPurge, created, meeting } = await createOrLoadMeetingSession({
    assets,
    meeting: {
      id: input.input.id,
      manifestSha256: input.input.manifestSha256,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      savedAt: input.input.savedAt,
      startedAt: input.input.startedAt,
    },
  });
  if (blockedByPurge) {
    return { code: "meeting-purged", conflict: true, message: "Meeting Session 已被永久清除" };
  }
  if (!meeting || !ownsMeeting(meeting, { ...input, manifestSha256: input.input.manifestSha256 })) {
    return {
      conflict: true,
      message: "Meeting Session 已绑定另一份本地录音清单",
    };
  }
  if (isMeetingLifecycleUnavailable(meeting.status)) {
    return { conflict: true, message: "Meeting Session 已移入废纸篓或正在永久清除" };
  }
  if (SERVER_VERIFIED_STATUSES.has(meeting.status)) {
    const recoveryCopyDeleteAfter =
      meeting.recoveryCopyDeleteAfter ??
      (await markMeetingSessionVerified({
        meetingId: meeting.id,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
      }));
    if (shouldAutomaticallyEnqueuePlayback(meeting.status)) {
      await enqueueMeetingPlaybackBestEffort({
        meetingId: meeting.id,
        organizationId: input.organizationId,
      });
    }
    return {
      created,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: recoveryCopyDeleteAfter.toISOString(),
      state: "workspace-verified",
      uploads: [],
    };
  }

  const uploads = await Promise.all(
    meeting.assets.map(async (asset) => {
      const signed = await presignMeetingRecordingPutObject({
        contentType: asset.contentType,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        storageKey: asset.storageKey,
      });
      return {
        contentType: asset.contentType,
        expiresAt: signed.expiresAt.toISOString(),
        headers: signed.headers,
        method: "PUT" as const,
        sizeBytes: asset.sizeBytes,
        track: asset.track as MeetingSourceTrack,
        url: signed.url,
      };
    }),
  );
  if (
    !(await meetingAcceptsUploadAuthorization({
      meetingId: meeting.id,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
    }))
  ) {
    return { conflict: true, message: "Meeting Session 已移入废纸篓或正在永久清除" };
  }
  return {
    created,
    meetingId: meeting.id,
    recoveryCopyDeleteAfter: null,
    state: "uploading",
    uploads,
  };
}

type MultipartCreateResult =
  | { code?: "meeting-purged"; conflict: true; message: string }
  | (MultipartSavedMeetingResponse & { created: boolean });

function normalizedEtag(etag: string): string {
  return etag.replaceAll('"', "").toLowerCase();
}

function multipartObjectEtag(parts: { md5Base64: string }[]): string {
  const binaryDigests = parts.map((part) => Buffer.from(part.md5Base64, "base64"));
  return `${createHash("md5").update(Buffer.concat(binaryDigests)).digest("hex")}-${parts.length}`;
}

function matchesMultipartObject(
  asset: NonNullable<Awaited<ReturnType<typeof loadMeetingSession>>>["assets"][number],
  object: Awaited<ReturnType<typeof headMeetingRecordingObject>>,
): boolean {
  if (!asset.multipartParts) {
    return false;
  }
  return Boolean(
    object &&
    object.contentLength === asset.sizeBytes &&
    object.contentType === asset.contentType &&
    object.sha256 === asset.sha256 &&
    object.etag &&
    normalizedEtag(object.etag) === multipartObjectEtag(asset.multipartParts),
  );
}

async function abortUnpersistedMultipartUpload(input: {
  storageKey: string;
  uploadId: string;
}): Promise<void> {
  try {
    await abortMeetingRecordingMultipartUpload(input);
  } catch (error) {
    console.error("[meeting-recording] failed to abort unpersisted multipart upload", error);
  }
}

export async function createMultipartSavedMeeting(input: {
  input: CreateMultipartSavedMeetingInput;
  organizationId: string;
  ownerId: string;
}): Promise<MultipartCreateResult> {
  const assets = await Promise.all(
    input.input.assets.map(async (asset) => ({
      ...asset,
      multipartParts: asset.parts,
      storageKey: await buildMeetingRecordingAssetKey({
        meetingId: input.input.id,
        organizationId: input.organizationId,
        track: asset.track,
      }),
      uploadMode: "multipart" as const,
    })),
  );
  const createdResult = await createOrLoadMeetingSession({
    assets,
    meeting: {
      id: input.input.id,
      manifestSha256: input.input.manifestSha256,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      savedAt: input.input.savedAt,
      startedAt: input.input.startedAt,
    },
  });
  if (createdResult.blockedByPurge) {
    return { code: "meeting-purged", conflict: true, message: "Meeting Session 已被永久清除" };
  }
  let { meeting } = createdResult;
  if (!meeting || !ownsMeeting(meeting, { ...input, manifestSha256: input.input.manifestSha256 })) {
    return { conflict: true, message: "Meeting Session 已绑定另一份本地录音清单" };
  }
  if (isMeetingLifecycleUnavailable(meeting.status)) {
    return { conflict: true, message: "Meeting Session 已移入废纸篓或正在永久清除" };
  }
  if (SERVER_VERIFIED_STATUSES.has(meeting.status)) {
    const recoveryCopyDeleteAfter =
      meeting.recoveryCopyDeleteAfter ??
      (await markMeetingSessionVerified({
        meetingId: meeting.id,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
      }));
    if (shouldAutomaticallyEnqueuePlayback(meeting.status)) {
      await enqueueMeetingPlaybackBestEffort({
        meetingId: meeting.id,
        organizationId: input.organizationId,
      });
    }
    return {
      created: createdResult.created,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: recoveryCopyDeleteAfter.toISOString(),
      state: "workspace-verified",
      uploads: [],
    };
  }
  const expectedByTrack = new Map(assets.map((asset) => [asset.track, asset]));
  const storedSourceAssets = sourceAssets(meeting.assets);
  const storedPlanMatches = storedSourceAssets.every((asset) => {
    const expected = expectedByTrack.get(asset.track as MeetingSourceTrack);
    return Boolean(
      expected &&
      asset.uploadMode === "multipart" &&
      asset.contentType === expected.contentType &&
      asset.sizeBytes === expected.sizeBytes &&
      asset.sha256 === expected.sha256 &&
      JSON.stringify(asset.multipartParts) === JSON.stringify(expected.parts),
    );
  });
  if (storedSourceAssets.length !== 2 || !storedPlanMatches) {
    return { conflict: true, message: "Meeting Session multipart 保存计划不一致" };
  }

  let initializedUpload = false;
  for (const asset of meeting.assets) {
    if (asset.multipartUploadId) {
      continue;
    }
    const uploadId = await createMeetingRecordingMultipartUpload({
      contentType: asset.contentType,
      sha256: asset.sha256,
      storageKey: asset.storageKey,
    });
    try {
      const recorded = await recordMeetingAssetMultipartUploadId({ assetId: asset.id, uploadId });
      if (!recorded) {
        await abortUnpersistedMultipartUpload({ storageKey: asset.storageKey, uploadId });
      }
    } catch (error) {
      await abortUnpersistedMultipartUpload({ storageKey: asset.storageKey, uploadId });
      throw error;
    }
    initializedUpload = true;
  }
  if (initializedUpload) {
    meeting = await loadMeetingSession(meeting.id);
  }
  if (!meeting) {
    return { conflict: true, message: "Meeting Session multipart 保存计划不存在" };
  }

  const uploadsByAsset = await Promise.all(
    sourceAssets(meeting.assets).map(async (asset) => {
      if (!(asset.multipartUploadId && asset.multipartParts)) {
        throw new Error("Meeting Session multipart 保存计划不完整");
      }
      const uploadId = asset.multipartUploadId;
      if (matchesMultipartObject(asset, await headMeetingRecordingObject(asset.storageKey))) {
        return [];
      }
      const confirmedParts = await listMeetingRecordingUploadParts({
        storageKey: asset.storageKey,
        uploadId,
      });
      const confirmedByNumber = new Map(confirmedParts.map((part) => [part.partNumber, part]));
      return Promise.all(
        asset.multipartParts.map(async (part) => {
          const confirmed = confirmedByNumber.get(part.partNumber);
          const expectedEtag = Buffer.from(part.md5Base64, "base64").toString("hex");
          if (
            confirmed?.sizeBytes === part.sizeBytes &&
            normalizedEtag(confirmed.etag) === expectedEtag
          ) {
            return null;
          }
          const signed = await presignMeetingRecordingUploadPart({
            md5Base64: part.md5Base64,
            partNumber: part.partNumber,
            sizeBytes: part.sizeBytes,
            storageKey: asset.storageKey,
            uploadId,
          });
          return {
            expiresAt: signed.expiresAt.toISOString(),
            headers: signed.headers,
            method: "PUT" as const,
            offsetBytes: part.offsetBytes,
            partNumber: part.partNumber,
            sizeBytes: part.sizeBytes,
            track: asset.track as MeetingSourceTrack,
            url: signed.url,
          };
        }),
      );
    }),
  );
  const uploads = uploadsByAsset.flatMap((parts) => parts.filter((part) => part !== null));
  if (
    !(await meetingAcceptsUploadAuthorization({
      meetingId: meeting.id,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
    }))
  ) {
    return { conflict: true, message: "Meeting Session 已移入废纸篓或正在永久清除" };
  }
  return {
    created: createdResult.created,
    meetingId: meeting.id,
    recoveryCopyDeleteAfter: null,
    state: "uploading",
    uploads,
  };
}

type CompleteResult =
  | { error: string; status: 404 | 409 }
  | {
      completed: boolean;
      meetingId: string;
      recoveryCopyDeleteAfter: string;
      state: "workspace-verified";
    };

export async function completeSmallSavedMeeting(input: {
  manifestSha256: string;
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<CompleteResult> {
  const meeting = await loadMeetingSession(input.meetingId);
  if (!meeting) {
    return (await isMeetingPurgeTombstoned(input.meetingId))
      ? { error: "Meeting Session 已被永久清除", status: 409 }
      : { error: "Meeting Session 不存在", status: 404 };
  }
  if (!ownsMeeting(meeting, input)) {
    return { error: "Meeting Session 保存身份不匹配", status: 409 };
  }
  if (isMeetingLifecycleUnavailable(meeting.status)) {
    return { error: "Meeting Session 已移入废纸篓或正在永久清除", status: 409 };
  }
  if (SERVER_VERIFIED_STATUSES.has(meeting.status)) {
    const recoveryCopyDeleteAfter =
      meeting.recoveryCopyDeleteAfter ?? (await markMeetingSessionVerified(input));
    if (shouldAutomaticallyEnqueuePlayback(meeting.status)) {
      await enqueueMeetingPlaybackBestEffort({
        meetingId: meeting.id,
        organizationId: input.organizationId,
      });
    }
    return {
      completed: false,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: recoveryCopyDeleteAfter.toISOString(),
      state: "workspace-verified",
    };
  }
  const sources = sourceAssets(meeting.assets);
  if (sources.length !== 2) {
    return { error: "Meeting Session 音轨不完整", status: 409 };
  }
  const verified = await Promise.all(
    sources.map(async (asset) => {
      if (asset.uploadMode === "multipart") {
        if (!(asset.multipartParts && asset.multipartUploadId)) {
          return false;
        }
        const existingObject = await headMeetingRecordingObject(asset.storageKey);
        if (matchesMultipartObject(asset, existingObject)) {
          return true;
        }
        const uploadedParts = await listMeetingRecordingUploadParts({
          storageKey: asset.storageKey,
          uploadId: asset.multipartUploadId,
        });
        const uploadedByNumber = new Map(uploadedParts.map((part) => [part.partNumber, part]));
        const exactParts = asset.multipartParts.map((part) => {
          const uploaded = uploadedByNumber.get(part.partNumber);
          const expectedEtag = Buffer.from(part.md5Base64, "base64").toString("hex");
          if (
            !uploaded ||
            uploaded.sizeBytes !== part.sizeBytes ||
            normalizedEtag(uploaded.etag) !== expectedEtag
          ) {
            return null;
          }
          return { etag: uploaded.etag, partNumber: part.partNumber };
        });
        if (
          uploadedParts.length !== asset.multipartParts.length ||
          exactParts.some((part) => part === null)
        ) {
          return false;
        }
        try {
          await completeMeetingRecordingMultipartUpload({
            parts: exactParts.filter((part) => part !== null),
            storageKey: asset.storageKey,
            uploadId: asset.multipartUploadId,
          });
        } catch (error) {
          if (matchesMultipartObject(asset, await headMeetingRecordingObject(asset.storageKey))) {
            return true;
          }
          throw error;
        }
        return matchesMultipartObject(asset, await headMeetingRecordingObject(asset.storageKey));
      }
      const object = await headMeetingRecordingObject(asset.storageKey);
      return Boolean(
        object &&
        object.checksumSha256 === Buffer.from(asset.sha256, "hex").toString("base64") &&
        object.contentLength === asset.sizeBytes &&
        object.contentType === asset.contentType &&
        object.sha256 === asset.sha256,
      );
    }),
  );
  if (verified.some((ready) => !ready)) {
    return { error: "源音轨尚未通过对象完整性校验", status: 409 };
  }
  const recoveryCopyDeleteAfter = await markMeetingSessionVerified(input);
  await enqueueMeetingPlaybackBestEffort({
    meetingId: meeting.id,
    organizationId: input.organizationId,
  });
  return {
    completed: true,
    meetingId: meeting.id,
    recoveryCopyDeleteAfter: recoveryCopyDeleteAfter.toISOString(),
    state: "workspace-verified",
  };
}

export async function listSavedMeetings(input: {
  memberRole: string;
  organizationId: string;
  recruitingRecordId?: string;
  userId: string;
}): Promise<MeetingLibraryItem[]> {
  const rows = await listMeetingSessionsForAccess({
    includeAllPrivateMeetings: isWorkspaceAdministrator(input.memberRole),
    organizationId: input.organizationId,
    ...(input.recruitingRecordId ? { recruitingRecordId: input.recruitingRecordId } : {}),
    userId: input.userId,
  });
  if (isWorkspaceAdministrator(input.memberRole)) {
    await recordMeetingAudit({
      action: "meeting.library_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      organizationId: input.organizationId,
    });
  }
  return rows.map((row) => ({
    accessRole: resolveMeetingAccessRole({
      grantRole: row.grantRole as MeetingGrantRole | null,
      isOwner: row.controllerId === input.userId,
      isWorkspaceAdministrator: isWorkspaceAdministrator(input.memberRole),
      visibility: row.visibility as "restricted" | "workspace",
    }) as MeetingAccessRole,
    creator: {
      id: row.creatorId,
      image: row.creatorImage,
      name: row.creatorName,
    },
    durationMs: row.durationMs,
    id: row.id,
    processingState: processingState(row.status),
    recordingAvailable: row.recordingAvailable,
    savedAt: row.savedAt.toISOString(),
    title: row.title,
    workspaceCustodied: row.workspaceCustodied,
  }));
}

export async function getSavedMeetingDetail(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingDetail | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!(meeting && meeting.owner)) {
    return null;
  }
  const sources = sourceAssets(meeting.assets);
  const playback = meeting.assets.find(
    (asset) => asset.track === "playback" && asset.status === "ready",
  );
  const accessRole = meetingRole(meeting, input);
  if (accessRole === "administrator") {
    await recordMeetingAudit({
      action: "meeting.detail_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: meeting.id,
      organizationId: input.organizationId,
    });
  }
  return {
    accessRole,
    creator: {
      id: meeting.owner.id,
      image: meeting.owner.image,
      name: meeting.owner.name,
    },
    durationMs: Math.max(0, ...sources.map((asset) => asset.durationMs)),
    id: meeting.id,
    processingState: processingState(meeting.status),
    recordingAvailable: Boolean(playback),
    savedAt: meeting.savedAt.toISOString(),
    startedAt: meeting.startedAt.toISOString(),
    title: meeting.title,
    verifiedAt: meeting.verifiedAt?.toISOString() ?? null,
    workspaceCustodied: meeting.workspaceCustodied,
  };
}

export async function createMeetingPlaybackAuthorization(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingPlaybackAuthorization | null> {
  const meeting = await loadAuthorizedMeeting(input);
  const playback = meeting?.assets.find(
    (asset) => asset.track === "playback" && asset.status === "ready",
  );
  if (!(meeting?.status === "ready" && playback)) {
    return null;
  }
  if (meetingRole(meeting, input) === "administrator") {
    await recordMeetingAudit({
      action: "meeting.playback_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: meeting.id,
      organizationId: input.organizationId,
    });
  }
  const expiresInSeconds = 300;
  const url = await presignRecordingGetObjectUrl(playback.storageKey, expiresInSeconds);
  return {
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    url,
  };
}

export async function retryMeetingPlayback(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<{ state: "processing" | "ready" | "unavailable" } | "forbidden" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canRetryProcessing) {
    return "forbidden";
  }
  if (meeting.status === "ready") {
    return { state: "ready" };
  }
  if (meeting.status !== "processing-failed") {
    return { state: "processing" };
  }
  if (!isMeetingProcessingQueueConfigured()) {
    return { state: "unavailable" };
  }
  await enqueueMeetingPlaybackJobs([
    { meetingId: input.meetingId, organizationId: input.organizationId },
  ]);
  await recordMeetingAudit({
    action: "meeting.processing_retried",
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  return { state: "processing" };
}
