import { describe, expect, it, vi } from "vitest";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { inspectCandidateConnection, inspectLiveSession } from "./live-session";

describe("interview reconnect requires the original agent", () => {
  it("detects a deleted room", async () => {
    expect(
      await inspectLiveSession(
        { listParticipants: vi.fn(), listRooms: () => Promise.resolve([]) },
        "old-room",
      ),
    ).toBe("ended");
  });
  it("does not consider a leftover candidate to be a live interview", async () => {
    expect(
      await inspectLiveSession(
        {
          listParticipants: () => Promise.resolve([{ kind: ParticipantInfo_Kind.STANDARD }]),
          listRooms: () => Promise.resolve([{}]),
        },
        "old-room",
      ),
    ).toBe("ended");
  });
  it("allows reconnection to an existing agent", async () => {
    expect(
      await inspectLiveSession(
        {
          listParticipants: () => Promise.resolve([{ kind: ParticipantInfo_Kind.AGENT }]),
          listRooms: () => Promise.resolve([{}]),
        },
        "old-room",
      ),
    ).toBe("active");
  });
  it("does not treat a LiveKit outage as a completed interview", async () => {
    expect(
      await inspectLiveSession(
        {
          listParticipants: vi.fn(),
          listRooms: () => Promise.reject(new Error("timeout")),
        },
        "old-room",
      ),
    ).toBe("unavailable");
  });
});

it("confirms only the original candidate together with the agent", async () => {
  const agent = { identity: "agent", kind: ParticipantInfo_Kind.AGENT };
  const candidate = { identity: "candidate", kind: ParticipantInfo_Kind.STANDARD };
  const client = {
    listParticipants: vi.fn(() => Promise.resolve([agent, candidate])),
    listRooms: vi.fn(),
  };
  expect(await inspectCandidateConnection(client, "room", "candidate")).toBe(true);
  expect(await inspectCandidateConnection(client, "room", "someone-else")).toBe(false);
  client.listParticipants.mockResolvedValue([candidate]);
  expect(await inspectCandidateConnection(client, "room", "candidate")).toBe(false);
  client.listParticipants.mockRejectedValue(new Error("timeout"));
  expect(await inspectCandidateConnection(client, "room", "candidate")).toBe(false);
});
