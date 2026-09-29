/* oxlint-disable anti-slop/no-module-mocking, max-classes-per-file -- Isolate LiveKit transport and the database-backed stop adapter while exercising token signing and deletion. */
import { afterEach, expect, it, vi } from "vitest";
import {
  deleteHumanInterviewLiveKitRoom,
  signHumanInterviewMeetingToken,
} from "./human-interview-livekit";

const mocks = vi.hoisted(() => ({
  deleteRoom: vi.fn(),
  prepare: vi.fn(),
  stop: vi.fn(),
  toJwt: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("../application/human-transcription", () => ({
  prepareHumanTranscription: mocks.prepare,
  requestHumanTranscriptionStop: mocks.stop,
  waitHumanTranscriptionReady: mocks.wait,
}));
vi.mock("livekit-server-sdk", () => ({
  AccessToken: class {
    addGrant = vi.fn();
    toJwt = mocks.toJwt;
  },
  RoomConfiguration: vi.fn(),
  RoomServiceClient: class {
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
