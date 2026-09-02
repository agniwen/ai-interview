import { AccessToken, RoomConfiguration, RoomServiceClient } from "livekit-server-sdk";
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
  const client = new RoomServiceClient(toHttpLiveKitUrl(serverUrl), apiKey, apiSecret);
  await client.deleteRoom(roomName);
}
