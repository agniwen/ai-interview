/* oxlint-disable anti-slop/no-module-mocking -- Isolate LiveKit transport and the database-backed stop adapter while exercising the public deletion boundary. */
import { afterEach, expect, it, vi } from "vitest";
import { deleteHumanInterviewLiveKitRoom } from "./human-interview-livekit";

const mocks = vi.hoisted(() => ({ deleteRoom: vi.fn(), stop: vi.fn() }));
vi.mock("../application/human-transcription", () => ({
  prepareHumanTranscription: vi.fn(),
  requestHumanTranscriptionStop: mocks.stop,
  waitHumanTranscriptionReady: vi.fn(),
}));
vi.mock("livekit-server-sdk", () => ({
  AccessToken: vi.fn(),
  RoomConfiguration: vi.fn(),
  RoomServiceClient: class {
    deleteRoom = mocks.deleteRoom;
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

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
