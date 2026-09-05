import { z } from "zod";
import type {
  CreateSmallSavedMeetingInput,
  SmallSavedMeetingResponse,
} from "@app/shared/meeting-recording";
import type { MeetingServiceDependencies } from "./service-dependencies";

const SERVER_VERIFIED_STATUSES = new Set([
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
]);
const meetingSourceTrackSchema = z.enum(["microphone", "system"]);

function sourceAssets<T extends { track: string }>(
  assets: T[],
): (T & { track: "microphone" | "system" })[] {
  return assets.filter(
    (asset): asset is T & { track: "microphone" | "system" } =>
      asset.track === "microphone" || asset.track === "system",
  );
}

function isMeetingLifecycleUnavailable(status: string): boolean {
  return status === "trashed" || status === "purging";
}

function shouldAutomaticallyEnqueuePlayback(status: string): boolean {
  return status === "workspace-verified" || status === "processing";
}

function ownsMeeting(
  meeting: NonNullable<Awaited<ReturnType<MeetingServiceDependencies["loadMeetingSession"]>>>,
  input: { manifestSha256: string; organizationId: string; ownerId: string },
): boolean {
  return (
    meeting.organizationId === input.organizationId &&
    meeting.ownerId === input.ownerId &&
    meeting.manifestSha256 === input.manifestSha256
  );
}

type CreateResult =
  | {
      code?: "meeting-purged" | "meeting-upload-capacity-exhausted";
      conflict: true;
      message: string;
    }
  | (SmallSavedMeetingResponse & { created: boolean });

export async function createSmallSavedMeeting(
  input: {
    input: CreateSmallSavedMeetingInput;
    organizationId: string;
    ownerId: string;
  },
  dependencies: MeetingServiceDependencies,
): Promise<CreateResult> {
  const assets = await Promise.all(
    input.input.assets.map(async (asset) => {
      const track = meetingSourceTrackSchema.parse(asset.track);
      return {
        ...asset,
        storageKey: await dependencies.buildMeetingRecordingAssetKey({
          meetingId: input.input.id,
          organizationId: input.organizationId,
          track,
        }),
        track,
      };
    }),
  );
  const { blockedByCapacity, blockedByPurge, created, meeting } =
    await dependencies.createOrLoadMeetingSession({
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
  if (blockedByCapacity) {
    return {
      code: "meeting-upload-capacity-exhausted",
      conflict: true,
      message: "录音上传容量已满，本地 Meeting Recording 已保留",
    };
  }
  if (blockedByPurge) {
    return { code: "meeting-purged", conflict: true, message: "Meeting Session 已被永久清除" };
  }
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
      await dependencies.enqueueMeetingPlaybackJobs([
        { meetingId: meeting.id, organizationId: input.organizationId },
      ]);
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
    sourceAssets(meeting.assets).map(async (asset) => {
      const signed = await dependencies.presignMeetingRecordingPutObject({
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
        track: asset.track,
        url: signed.url,
      };
    }),
  );
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
    created,
    meetingId: meeting.id,
    recoveryCopyDeleteAfter: null,
    state: "uploading",
    uploads,
  };
}
