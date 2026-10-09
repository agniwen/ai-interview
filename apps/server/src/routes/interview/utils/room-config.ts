import { RECONNECT_GRACE_MS } from "@app/db-schema/studio-interviews";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

export function buildInterviewRoomConfig(agentName: string): RoomConfiguration {
  return new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName })],
    // Keep the room past the agent's grace timer so it can finalize and report.
    departureTimeout: Math.ceil(RECONNECT_GRACE_MS / 1000) + 60,
  });
}
