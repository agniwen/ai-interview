/* oxlint-disable anti-slop/no-module-mocking, max-classes-per-file -- Isolate LiveKit transport and the database-backed stop adapter while exercising token signing and deletion. */
import type * as livekitSdk from "livekit-server-sdk";
import { afterEach, expect, it, vi } from "vitest";
import {
  deleteHumanInterviewLiveKitRoom,
  getHumanInterviewAdmissionError,
  signHumanInterviewMeetingToken,
} from "../human-interview-livekit";

const mocks = vi.hoisted(() => ({
  deleteRoom: vi.fn(),
  participants: vi.fn(),
  prepare: vi.fn(),
  stop: vi.fn(),
  toJwt: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("../human-transcription", () => ({
  prepareHumanTranscription: mocks.prepare,
  requestHumanTranscriptionStop: mocks.stop,
  waitHumanTranscriptionReady: mocks.wait,
}));
vi.mock("livekit-server-sdk", async (original) => ({
  ...(await original<typeof livekitSdk>()),
  AccessToken: class {
    addGrant = vi.fn();
    toJwt = mocks.toJwt;
  },
  RoomConfiguration: vi.fn(),
  RoomServiceClient: class {
    listParticipants = mocks.participants;
    deleteRoom = mocks.deleteRoom;
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each(["prepare", "wait"] as const)(
  "still signs the meeting token when transcription %s fails",
  async (step) => {
    vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
    vi.stubEnv("LIVEKIT_API_KEY", "test");
    vi.stubEnv("LIVEKIT_API_SECRET", "test");
    mocks.prepare.mockImplementation(async () => {});
    mocks.wait.mockImplementation(async () => {});
    mocks.toJwt.mockResolvedValue("signed-token");
    mocks[step].mockRejectedValueOnce(new Error("transcription unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await signHumanInterviewMeetingToken({
      canPublish: true,
      metadata: {},
      participantIdentity: "interviewer-1",
      participantName: "面试官",
      participantRole: "interviewer",
      roomName: "room",
    });

    expect(result.participantToken).toBe("signed-token");
    expect(warning).toHaveBeenCalledWith("human transcription unavailable; meeting continues", {
      error: "transcription unavailable",
      roomName: "room",
    });
  },
);

it.each(["finalizing", "ready", "needs_review"])(
  "delegates %s realtime cleanup to the reconciler",
  async (status) => {
    vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
    vi.stubEnv("LIVEKIT_API_KEY", "test");
    vi.stubEnv("LIVEKIT_API_SECRET", "test");
    mocks.stop.mockResolvedValue({ mode: "server_realtime", status });
    await deleteHumanInterviewLiveKitRoom("room");
    await deleteHumanInterviewLiveKitRoom("room");
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
  },
);
it("still deletes legacy rooms", async () => {
  vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
  vi.stubEnv("LIVEKIT_API_KEY", "test");
  vi.stubEnv("LIVEKIT_API_SECRET", "test");
  mocks.stop.mockImplementation(async () => {});
  await deleteHumanInterviewLiveKitRoom("room");
  expect(mocks.deleteRoom).toHaveBeenCalledWith("room");
});

const overtimeMeeting = {
  liveKitRoomName: "human_test",
  scheduledAt: "2025-01-01T10:00:00Z",
  status: "in_progress" as const,
  validUntil: "2025-01-01T11:00:00Z",
};

it.each([
  { allowed: true, identities: ["candidate_1"] },
  { allowed: true, identities: ["interviewer_2"] },
  { allowed: false, identities: ["transcription-agent", "EG_recorder"] },
  { allowed: false, identities: [] },
])(
  "checks live attendees before overtime admission: $identities",
  async ({ identities, allowed }) => {
    vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
    vi.stubEnv("LIVEKIT_API_KEY", "test");
    vi.stubEnv("LIVEKIT_API_SECRET", "test");
    mocks.participants.mockResolvedValue(identities.map((identity) => ({ identity })));
    const error = await getHumanInterviewAdmissionError(overtimeMeeting);
    expect(error?.status ?? 200).toBe(allowed ? 200 : 403);
    expect(mocks.participants).toHaveBeenCalledWith("human_test");
  },
);

it("allows a retry when occupancy is unknown", async () => {
  vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
  vi.stubEnv("LIVEKIT_API_KEY", "test");
  vi.stubEnv("LIVEKIT_API_SECRET", "test");
  mocks.participants.mockRejectedValueOnce(new Error("timeout"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = await getHumanInterviewAdmissionError(overtimeMeeting);
  expect(error?.status).toBe(503);
});

it.each(["cancelled", "ended", "not_held"] as const)(
  "blocks terminal status %s without probing LiveKit",
  async (status) => {
    const error = await getHumanInterviewAdmissionError({ ...overtimeMeeting, status });
    expect(error?.status).toBe(403);
    expect(mocks.participants).not.toHaveBeenCalled();
  },
);
