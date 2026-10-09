import { describe, expect, it } from "vitest";
import { AccessToken } from "livekit-server-sdk";
import { RECONNECT_GRACE_MS } from "@app/db-schema/studio-interviews";
import { buildInterviewRoomConfig } from "./room-config";

describe("AI interview room lifetime", () => {
  it("keeps the room alive beyond the candidate reconnect window in the signed token", async () => {
    const token = new AccessToken("test-key", "test-secret", { identity: "test-candidate" });
    token.addGrant({ room: "test-room", roomJoin: true });
    token.roomConfig = buildInterviewRoomConfig("test-agent");
    const jwt = await token.toJwt();
    const [, payload] = jwt.split(".");
    if (!payload) {
      throw new Error("Missing JWT payload");
    }
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.roomConfig.departureTimeout * 1000).toBeGreaterThan(RECONNECT_GRACE_MS);
    expect(claims.roomConfig.agents).toMatchObject([{ agentName: "test-agent" }]);
  });
});
