import {
  buildMeetingRecordingAssetKey,
  headMeetingRecordingObject,
  presignMeetingRecordingPutObject,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { createOrLoadMeetingSession, loadMeetingSession, markMeetingSessionVerified } from "./dao";
import type {
  CreateSmallSavedMeetingInput,
  MeetingSourceTrack,
  SmallSavedMeetingResponse,
} from "@arc/shared/meeting-recording";

type CreateResult =
  | { conflict: true; message: string }
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
  const { created, meeting } = await createOrLoadMeetingSession({
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
  if (!meeting || !ownsMeeting(meeting, { ...input, manifestSha256: input.input.manifestSha256 })) {
    return {
      conflict: true,
      message: "Meeting Session 已绑定另一份本地录音清单",
    };
  }
  if (meeting.status === "workspace-verified") {
    return {
      created,
      meetingId: meeting.id,
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
  return { created, meetingId: meeting.id, state: "uploading", uploads };
}

type CompleteResult =
  | { error: string; status: 404 | 409 }
  | { completed: boolean; meetingId: string; state: "workspace-verified" };

export async function completeSmallSavedMeeting(input: {
  manifestSha256: string;
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<CompleteResult> {
  const meeting = await loadMeetingSession(input.meetingId);
  if (!meeting) {
    return { error: "Meeting Session 不存在", status: 404 };
  }
  if (!ownsMeeting(meeting, input)) {
    return { error: "Meeting Session 保存身份不匹配", status: 409 };
  }
  if (meeting.status === "workspace-verified") {
    return { completed: false, meetingId: meeting.id, state: "workspace-verified" };
  }
  if (meeting.assets.length !== 2) {
    return { error: "Meeting Session 音轨不完整", status: 409 };
  }
  const verified = await Promise.all(
    meeting.assets.map(async (asset) => {
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
  await markMeetingSessionVerified(input);
  return { completed: true, meetingId: meeting.id, state: "workspace-verified" };
}
