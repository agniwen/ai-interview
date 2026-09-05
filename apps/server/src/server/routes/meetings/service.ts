import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  MeetingObjectHead,
  MeetingServiceAsset,
  MeetingServiceDependencies,
  MeetingServiceSession,
} from "./service-dependencies";
import { defaultMeetingServiceDependencies } from "./service-dependencies";
import type { listMeetingSessionsForAccess } from "./dao";
import type {
  CreateMultipartSavedMeetingInput,
  MeetingDetail,
  MeetingLibraryItem,
  MeetingPlaybackAuthorization,
  MeetingProcessingState,
  MeetingSourceTrack,
  MultipartSavedMeetingResponse,
} from "@app/shared/meeting-recording";
import { meetingLiveSummarySnapshotSchema } from "@app/shared/meeting-live-summary";
import {
  isWorkspaceAdministrator,
  meetingAccessCapabilities,
  resolveMeetingAccessRole,
} from "./access";
import { meetingRole } from "./authorized-meeting";
import { createSmallSavedMeeting as createSmallSavedMeetingWithDependencies } from "./small-service";

const defaultDependencies = defaultMeetingServiceDependencies;

const SERVER_VERIFIED_STATUSES = new Set([
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
]);
const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;
const meetingGrantRoleSchema = z.enum(["editor", "viewer"]);
const meetingSourceTrackSchema = z.enum(["microphone", "system"]);
const meetingVisibilitySchema = z.enum(["restricted", "workspace"]);

function sourceAssets<T extends { track: string }>(
  assets: T[],
): (T & { track: MeetingSourceTrack })[] {
  return assets.filter(
    (asset): asset is T & { track: MeetingSourceTrack } =>
      asset.track === "microphone" || asset.track === "system",
  );
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

export function heartbeatSavedMeetingUpload(
  input: {
    meetingId: string;
    organizationId: string;
    ownerId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<boolean> {
  return dependencies.renewMeetingDirectUploadLease(input);
}

function isMeetingLifecycleUnavailable(status: string): boolean {
  return status === "trashed" || status === "purging";
}

async function enqueueMeetingPlaybackBestEffort(
  input: {
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingServiceDependencies,
): Promise<void> {
  try {
    await dependencies.enqueueMeetingPlaybackJobs([input]);
  } catch (error) {
    console.error("[meeting-playback] enqueue failed; startup recovery will retry", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

export const createSmallSavedMeeting = (
  input: Parameters<typeof createSmallSavedMeetingWithDependencies>[0],
  dependencies: MeetingServiceDependencies = defaultDependencies,
) => createSmallSavedMeetingWithDependencies(input, dependencies);

type MultipartCreateResult =
  | {
      code?: "meeting-purged" | "meeting-upload-capacity-exhausted";
      conflict: true;
      message: string;
    }
  | (MultipartSavedMeetingResponse & { created: boolean });

function normalizedEtag(etag: string): string {
  return etag.replaceAll('"', "").toLowerCase();
}

function multipartObjectEtag(parts: { md5Base64: string }[]): string {
  const binaryDigests = parts.map((part) => Buffer.from(part.md5Base64, "base64"));
  return `${createHash("md5").update(Buffer.concat(binaryDigests)).digest("hex")}-${parts.length}`;
}

function matchesMultipartObject(
  asset: MeetingServiceAsset,
  object: MeetingObjectHead | null,
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

function matchesStoredMultipartPlan(
  asset: Pick<
    MeetingServiceAsset,
    "contentType" | "multipartParts" | "sha256" | "sizeBytes" | "uploadMode"
  > & { track: string },
  expected:
    | (Pick<
        MeetingServiceAsset,
        "contentType" | "multipartParts" | "sha256" | "sizeBytes" | "uploadMode"
      > & { track: string })
    | undefined,
): boolean {
  return Boolean(
    expected &&
    asset.uploadMode === "multipart" &&
    asset.contentType === expected.contentType &&
    asset.sizeBytes === expected.sizeBytes &&
    asset.sha256 === expected.sha256 &&
    JSON.stringify(asset.multipartParts) === JSON.stringify(expected.multipartParts),
  );
}

async function abortUnpersistedMultipartUpload(
  input: {
    storageKey: string;
    uploadId: string;
  },
  dependencies: MeetingServiceDependencies,
): Promise<void> {
  try {
    await dependencies.abortMeetingRecordingMultipartUpload(input);
  } catch (error) {
    console.error("[meeting-recording] failed to abort unpersisted multipart upload", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

type MeetingSession = MeetingServiceSession;

function ownsMeeting(
  meeting: MeetingSession,
  input: { manifestSha256: string; organizationId: string; ownerId: string },
): boolean {
  return (
    meeting.organizationId === input.organizationId &&
    meeting.ownerId === input.ownerId &&
    meeting.manifestSha256 === input.manifestSha256
  );
}

async function initializeMultipartUploads(
  meeting: MeetingSession,
  dependencies: MeetingServiceDependencies,
): Promise<MeetingSession | undefined> {
  let initializedUpload = false;
  for (const asset of meeting.assets) {
    if (asset.multipartUploadId) {
      continue;
    }
    const uploadId = await dependencies.createMeetingRecordingMultipartUpload({
      contentType: asset.contentType,
      sha256: asset.sha256,
      storageKey: asset.storageKey,
    });
    try {
      const recorded = await dependencies.recordMeetingAssetMultipartUploadId({
        assetId: asset.id,
        uploadId,
      });
      if (!recorded) {
        await abortUnpersistedMultipartUpload(
          { storageKey: asset.storageKey, uploadId },
          dependencies,
        );
      }
    } catch (error) {
      await abortUnpersistedMultipartUpload(
        { storageKey: asset.storageKey, uploadId },
        dependencies,
      );
      throw error;
    }
    initializedUpload = true;
  }
  return initializedUpload ? dependencies.loadMeetingSession(meeting.id) : meeting;
}

export async function createMultipartSavedMeeting(
  input: {
    input: CreateMultipartSavedMeetingInput;
    organizationId: string;
    ownerId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<MultipartCreateResult> {
  const assets = await Promise.all(
    input.input.assets.map(async (asset) => {
      const track = meetingSourceTrackSchema.parse(asset.track);
      return {
        ...asset,
        multipartParts: asset.parts,
        storageKey: await dependencies.buildMeetingRecordingAssetKey({
          meetingId: input.input.id,
          organizationId: input.organizationId,
          track,
        }),
        track,
        uploadMode: "multipart" as const,
      };
    }),
  );
  const createdResult = await dependencies.createOrLoadMeetingSession({
    assets,
    meeting: {
      id: input.input.id,
      liveSummary: input.input.liveSummary ?? null,
      liveTranscriptDraft: input.input.liveTranscriptDraft ?? null,
      manifestSha256: input.input.manifestSha256,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      savedAt: input.input.savedAt,
      startedAt: input.input.startedAt,
      title: input.input.title,
    },
  });
  if (createdResult.blockedByCapacity) {
    return {
      code: "meeting-upload-capacity-exhausted",
      conflict: true,
      message: "录音上传容量已满，本地 Meeting Recording 已保留",
    };
  }
  if (createdResult.blockedByPurge) {
    return { code: "meeting-purged", conflict: true, message: "Meeting Session 已被永久清除" };
  }
  let { meeting } = createdResult;
  if (!meeting || !ownsMeeting(meeting, { ...input, manifestSha256: input.input.manifestSha256 })) {
    return { conflict: true, message: "Meeting Session 已绑定另一份本地录音清单" };
  }
  if (isMeetingLifecycleUnavailable(meeting.status)) {
    return { conflict: true, message: "Meeting Session 已归档或正在永久清除" };
  }
  if (SERVER_VERIFIED_STATUSES.has(meeting.status)) {
    const recoveryCopyDeleteAfter =
      meeting.recoveryCopyDeleteAfter ??
      (await dependencies.markMeetingSessionVerified({
        meetingId: meeting.id,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
      }));
    if (shouldAutomaticallyEnqueuePlayback(meeting.status)) {
      await enqueueMeetingPlaybackBestEffort(
        {
          meetingId: meeting.id,
          organizationId: input.organizationId,
        },
        dependencies,
      );
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
  const storedPlanMatches = storedSourceAssets.every((asset) =>
    matchesStoredMultipartPlan(asset, expectedByTrack.get(asset.track)),
  );
  if (storedSourceAssets.length !== 2 || !storedPlanMatches) {
    return { conflict: true, message: "Meeting Session multipart 保存计划不一致" };
  }

  meeting = await initializeMultipartUploads(meeting, dependencies);
  if (!meeting) {
    return { conflict: true, message: "Meeting Session multipart 保存计划不存在" };
  }

  const uploadsByAsset = await Promise.all(
    sourceAssets(meeting.assets).map(async (asset) => {
      if (!(asset.multipartUploadId && asset.multipartParts)) {
        throw new Error("Meeting Session multipart 保存计划不完整");
      }
      const uploadId = asset.multipartUploadId;
      if (
        matchesMultipartObject(
          asset,
          await dependencies.headMeetingRecordingObject(asset.storageKey),
        )
      ) {
        return [];
      }
      const confirmedParts = await dependencies.listMeetingRecordingUploadParts({
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
          const signed = await dependencies.presignMeetingRecordingUploadPart({
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
            track: asset.track,
            url: signed.url,
          };
        }),
      );
    }),
  );
  const uploads = uploadsByAsset.flatMap((parts) => parts.filter((part) => part !== null));
  if (
    !(await dependencies.renewMeetingDirectUploadLease({
      meetingId: meeting.id,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
    }))
  ) {
    return {
      code: "meeting-upload-capacity-exhausted",
      conflict: true,
      message: "录音上传容量已满，本地 Meeting Recording 已保留",
    };
  }
  if (
    !(await dependencies.meetingAcceptsUploadAuthorization({
      meetingId: meeting.id,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
    }))
  ) {
    return { conflict: true, message: "Meeting Session 已归档或正在永久清除" };
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

export async function completeSmallSavedMeeting(
  input: {
    manifestSha256: string;
    meetingId: string;
    organizationId: string;
    ownerId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<CompleteResult> {
  const meeting = await dependencies.loadMeetingSession(input.meetingId);
  if (!meeting) {
    return (await dependencies.isMeetingPurgeTombstoned(input.meetingId))
      ? { error: "Meeting Session 已被永久清除", status: 409 }
      : { error: "Meeting Session 不存在", status: 404 };
  }
  if (!ownsMeeting(meeting, input)) {
    return { error: "Meeting Session 保存身份不匹配", status: 409 };
  }
  if (isMeetingLifecycleUnavailable(meeting.status)) {
    return { error: "Meeting Session 已归档或正在永久清除", status: 409 };
  }
  if (SERVER_VERIFIED_STATUSES.has(meeting.status)) {
    const recoveryCopyDeleteAfter =
      meeting.recoveryCopyDeleteAfter ?? (await dependencies.markMeetingSessionVerified(input));
    if (shouldAutomaticallyEnqueuePlayback(meeting.status)) {
      await enqueueMeetingPlaybackBestEffort(
        {
          meetingId: meeting.id,
          organizationId: input.organizationId,
        },
        dependencies,
      );
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
        const existingObject = await dependencies.headMeetingRecordingObject(asset.storageKey);
        if (matchesMultipartObject(asset, existingObject)) {
          return true;
        }
        const uploadedParts = await dependencies.listMeetingRecordingUploadParts({
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
          await dependencies.completeMeetingRecordingMultipartUpload({
            parts: exactParts.filter((part) => part !== null),
            storageKey: asset.storageKey,
            uploadId: asset.multipartUploadId,
          });
        } catch (error) {
          if (
            matchesMultipartObject(
              asset,
              await dependencies.headMeetingRecordingObject(asset.storageKey),
            )
          ) {
            return true;
          }
          throw error;
        }
        return matchesMultipartObject(
          asset,
          await dependencies.headMeetingRecordingObject(asset.storageKey),
        );
      }
      const object = await dependencies.headMeetingRecordingObject(asset.storageKey);
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
  const recoveryCopyDeleteAfter = await dependencies.markMeetingSessionVerified(input);
  await enqueueMeetingPlaybackBestEffort(
    {
      meetingId: meeting.id,
      organizationId: input.organizationId,
    },
    dependencies,
  );
  return {
    completed: true,
    meetingId: meeting.id,
    recoveryCopyDeleteAfter: recoveryCopyDeleteAfter.toISOString(),
    state: "workspace-verified",
  };
}

export async function listSavedMeetings(
  input: {
    memberRole: string;
    organizationId: string;
    recruitingRecordId?: string;
    userId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<MeetingLibraryItem[]> {
  const query: Parameters<typeof listMeetingSessionsForAccess>[0] = {
    includeAllPrivateMeetings: isWorkspaceAdministrator(input.memberRole),
    organizationId: input.organizationId,
    userId: input.userId,
  };
  if (input.recruitingRecordId) {
    query.recruitingRecordId = input.recruitingRecordId;
  }
  const rows = await dependencies.listMeetingSessionsForAccess(query);
  if (isWorkspaceAdministrator(input.memberRole)) {
    await dependencies.recordMeetingAudit({
      action: "meeting.library_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      organizationId: input.organizationId,
    });
  }
  return rows.map((row) => {
    const grantRole = meetingGrantRoleSchema.safeParse(row.grantRole);
    const visibility = meetingVisibilitySchema.parse(row.visibility);
    const accessRole = resolveMeetingAccessRole({
      grantRole: grantRole.success ? grantRole.data : null,
      isOwner: row.controllerId === input.userId,
      isWorkspaceAdministrator: isWorkspaceAdministrator(input.memberRole),
      visibility,
    });
    if (!accessRole) {
      throw new Error("Meeting Session access query returned an inaccessible meeting");
    }
    return {
      accessRole,
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
    };
  });
}

export async function getSavedMeetingDetail(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<MeetingDetail | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (
    !(
      meeting &&
      meeting.owner &&
      meeting.savedAt &&
      meeting.startedAt &&
      meeting.workspaceCustodied !== undefined
    )
  ) {
    return null;
  }
  const sources = sourceAssets(meeting.assets);
  const playback = meeting.assets.find(
    (asset) => asset.track === "playback" && asset.status === "ready",
  );
  const accessRole = meetingRole(meeting, input);
  const liveSummary = meetingLiveSummarySnapshotSchema.safeParse(meeting.liveSummary);
  if (accessRole === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.detail_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: meeting.id,
      organizationId: input.organizationId,
    });
  }
  return {
    accessRole,
    archived: meeting.status === "trashed",
    creator: {
      id: meeting.owner.id,
      image: meeting.owner.image,
      name: meeting.owner.name,
    },
    durationMs: Math.max(0, ...sources.map((asset) => asset.durationMs ?? 0)),
    id: meeting.id,
    liveSummary: liveSummary.success ? liveSummary.data : null,
    processingState: processingState(
      meeting.status === "trashed" ? (meeting.trashedFromStatus ?? "ready") : meeting.status,
    ),
    recordingAvailable: Boolean(playback),
    savedAt: meeting.savedAt.toISOString(),
    startedAt: meeting.startedAt.toISOString(),
    title: meeting.title ?? "",
    verifiedAt: meeting.verifiedAt?.toISOString() ?? null,
    workspaceCustodied: meeting.workspaceCustodied,
  };
}

export async function renameSavedMeeting(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    title: string;
    userId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<"forbidden" | { title: string } | null> {
  const meeting = await dependencies.loadAuthorized(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canEditMetadata) {
    return "forbidden";
  }
  return dependencies.renameMeetingSession({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    title: input.title,
  });
}

export async function createMeetingPlaybackAuthorization(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<MeetingPlaybackAuthorization | null> {
  const meeting = await dependencies.loadAuthorized(input);
  const playback = meeting?.assets.find(
    (asset) => asset.track === "playback" && asset.status === "ready",
  );
  if (!(meeting && playback && (meeting.status === "ready" || meeting.status === "trashed"))) {
    return null;
  }
  if (meetingRole(meeting, input) === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.playback_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: meeting.id,
      organizationId: input.organizationId,
    });
  }
  const expiresInSeconds = 300;
  const url = await dependencies.presignRecordingGetObjectUrl(
    playback.storageKey,
    expiresInSeconds,
  );
  return {
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    url,
  };
}

export async function retryMeetingPlayback(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingServiceDependencies = defaultDependencies,
): Promise<{ state: "processing" | "ready" | "unavailable" } | "forbidden" | null> {
  const meeting = await dependencies.loadAuthorized(input);
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
  if (!dependencies.isMeetingProcessingQueueConfigured()) {
    return { state: "unavailable" };
  }
  await dependencies.enqueueMeetingPlaybackJobs([
    { meetingId: input.meetingId, organizationId: input.organizationId },
  ]);
  await dependencies.recordMeetingAudit({
    action: "meeting.processing_retried",
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  return { state: "processing" };
}
