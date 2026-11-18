import {
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
} from "./human-interview-meeting-access";
import type { HumanInterviewMeetingStatus } from "@app/db-schema/studio-interviews";
import {
  prepareHumanTranscription,
  waitHumanTranscriptionReady,
  requestHumanTranscriptionStop,
} from "./human-transcription";
import {
  AccessToken,
  RoomConfiguration,
  RoomServiceClient,
  TwirpError,
  ParticipantInfo_State,
} from "livekit-server-sdk";
import type {
  HumanInterviewMeetingParticipantRole,
  HumanInterviewMeetingTokenResponse,
} from "@app/shared/studio-pipeline-stages";
import type { JsonObject } from "@app/db-schema/json";

interface LiveKitServerConfig {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
}

export class HumanInterviewLiveKitConfigError extends Error {
  constructor() {
    super("LiveKit configuration is missing");
    this.name = "HumanInterviewLiveKitConfigError";
  }
}

function getLiveKitServerConfig(): LiveKitServerConfig {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    throw new HumanInterviewLiveKitConfigError();
  }

  return { apiKey, apiSecret, serverUrl };
}

function toHttpLiveKitUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  return url.toString();
}

export async function signHumanInterviewMeetingToken({
  canPublish,
  metadata,
  participantIdentity,
  participantName,
  participantRole,
  roomName,
}: {
  canPublish: boolean;
  metadata: JsonObject;
  participantIdentity: string;
  participantName: string;
  participantRole: HumanInterviewMeetingParticipantRole;
  roomName: string;
}): Promise<HumanInterviewMeetingTokenResponse> {
  const { apiKey, apiSecret, serverUrl } = getLiveKitServerConfig();

  try {
    await prepareHumanTranscription(roomName);
    await waitHumanTranscriptionReady(roomName);
  } catch (error) {
    // Transcription can recover from the meeting recording; it must not prevent joining.
    console.warn("human transcription unavailable; meeting continues", {
      error: error instanceof Error ? error.message : String(error),
      roomName,
    });
  }
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    metadata: JSON.stringify(metadata),
    name: participantName,
    ttl: "2h",
  });

  at.addGrant({
    canPublish,
    canPublishData: true,
    canSubscribe: true,
    room: roomName,
    roomJoin: true,
  });
  at.roomConfig = new RoomConfiguration({
    departureTimeout: 30,
    emptyTimeout: 30,
  });

  return {
    participantName,
    participantRole,
    participantToken: await at.toJwt(),
    roomName,
    serverUrl,
  };
}

export async function deleteHumanInterviewLiveKitRoom(roomName: string | null): Promise<void> {
  if (!roomName) {
    return;
  }
  const { apiKey, apiSecret, serverUrl } = getLiveKitServerConfig();
  const run = await requestHumanTranscriptionStop(roomName);
  if (run?.mode === "server_realtime") {
    return;
  }
  const client = new RoomServiceClient(toHttpLiveKitUrl(serverUrl), apiKey, apiSecret);
  await client.deleteRoom(roomName);
}

export async function getHumanInterviewLiveKitParticipant(roomName: string, identity: string) {
  const { apiKey, apiSecret, serverUrl } = getLiveKitServerConfig();
  const client = new RoomServiceClient(toHttpLiveKitUrl(serverUrl), apiKey, apiSecret);
  return await client.getParticipant(roomName, identity);
}

export async function listHumanInterviewLiveKitParticipants(roomName: string) {
  const { apiKey, apiSecret, serverUrl } = getLiveKitServerConfig();
  return await new RoomServiceClient(
    toHttpLiveKitUrl(serverUrl),
    apiKey,
    apiSecret,
  ).listParticipants(roomName);
}

export async function listHumanInterviewLiveKitRooms(names: string[]) {
  const { apiKey, apiSecret, serverUrl } = getLiveKitServerConfig();
  return await new RoomServiceClient(toHttpLiveKitUrl(serverUrl), apiKey, apiSecret).listRooms(
    names,
  );
}

export async function getHumanInterviewRoomPresence(roomName: string | null) {
  if (!roomName) {
    return "empty";
  }
  try {
    const participants = await listHumanInterviewLiveKitParticipants(roomName);
    return participants.some(
      ({ identity, state }) =>
        state !== ParticipantInfo_State.DISCONNECTED &&
        (identity.startsWith("candidate_") || identity.startsWith("interviewer_")),
    )
      ? "occupied"
      : "empty";
  } catch (error) {
    if (error instanceof TwirpError && error.code === "not_found") {
      return "empty";
    }
    console.warn("Failed to check human interview room presence", { error, roomName });
    return "unavailable";
  }
}

export async function getHumanInterviewAdmissionError(meeting: {
  liveKitRoomName: string | null;
  scheduledAt: string | null;
  status: HumanInterviewMeetingStatus;
  validUntil: string | null;
}): Promise<{ message: string; status: 403 | 503 } | null> {
  if (meeting.status !== "scheduled" && meeting.status !== "in_progress") {
    return {
      message:
        meeting.status === "not_held"
          ? "该真人复面会议已标记为未召开。"
          : "该真人复面会议已结束或取消。",
      status: 403,
    };
  }
  if (
    meeting.status === "scheduled" &&
    isHumanInterviewMeetingBeforeScheduledStart(meeting.scheduledAt)
  ) {
    return { message: "未到入会时间，面试开始前 15 分钟可进入会议。", status: 403 };
  }
  if (!isHumanInterviewMeetingAfterValidUntil(meeting.validUntil)) {
    return null;
  }
  const presence = await getHumanInterviewRoomPresence(meeting.liveKitRoomName);
  if (presence === "unavailable") {
    return { message: "暂时无法确认会议室内是否有人，请稍后重试。", status: 503 };
  }
  return presence === "occupied"
    ? null
    : { message: "该真人复面会议已超过有效时间。", status: 403 };
}
