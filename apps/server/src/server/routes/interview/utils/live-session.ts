import { ParticipantInfo_Kind } from "@livekit/protocol";
import { RoomServiceClient } from "livekit-server-sdk";

interface RoomProbe {
  listRooms: (names: string[]) => Promise<unknown[]>;
  listParticipants: (room: string) => Promise<{ kind: ParticipantInfo_Kind }[]>;
}

export async function inspectLiveSession(
  client: RoomProbe,
  room: string,
): Promise<"active" | "ended" | "unavailable"> {
  try {
    const rooms = await client.listRooms([room]);
    if (rooms.length === 0) {
      return "ended";
    }
    const participants = await client.listParticipants(room);
    return participants.some((participant) => participant.kind === ParticipantInfo_Kind.AGENT)
      ? "active"
      : "ended";
  } catch {
    // Failed probes never authorize a replacement agent or a terminal transition.
    return "unavailable";
  }
}

export function getInterviewLiveSession(room: string) {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!url || !key || !secret) {
    return Promise.resolve("unavailable" as const);
  }
  const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return inspectLiveSession(
    new RoomServiceClient(httpUrl, key, secret, { requestTimeout: 3000 }),
    room,
  );
}
