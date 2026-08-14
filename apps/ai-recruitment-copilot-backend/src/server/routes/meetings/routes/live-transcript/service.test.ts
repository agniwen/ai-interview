import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceMeetingLiveTranscriptAuthorization } from "./service";

const mocks = vi.hoisted(() => ({
  claimMeetingLiveTranscriptLease: vi.fn().mockResolvedValue("created"),
  createQwenRealtimeTranscriptionAuthorization: vi.fn().mockResolvedValue({
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    clientSecret: "st-temp-token",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
    track: "microphone",
  }),
  gateIssue: vi.fn((_input: unknown, mint: () => unknown) => mint()),
  releaseMeetingLiveTranscriptTrackLease: vi.fn().mockResolvedValue(null),
  resolveMeetingTranscriptionQwenBaseUrl: vi.fn().mockReturnValue("https://dashscope.aliyuncs.com"),
}));

vi.mock("../../transcription/provider-endpoint", () => ({
  resolveMeetingTranscriptionQwenBaseUrl: mocks.resolveMeetingTranscriptionQwenBaseUrl,
}));
vi.mock("../../transcription/providers/qwen-realtime", () => ({
  DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL: "qwen3-asr-flash-realtime",
  createQwenRealtimeTranscriptionAuthorization: mocks.createQwenRealtimeTranscriptionAuthorization,
}));
vi.mock("./authorization-gate", () => ({
  liveTranscriptAuthorizationGate: { issue: mocks.gateIssue },
}));
vi.mock("./dao", () => ({
  claimMeetingLiveTranscriptLease: mocks.claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease: vi.fn(),
  releaseMeetingLiveTranscriptTrackLease: mocks.releaseMeetingLiveTranscriptTrackLease,
  renewMeetingLiveTranscriptLease: vi.fn(),
}));

const baseInput = {
  captureId: "00000000-0000-4000-8000-000000000077",
  organizationId: "org-77",
  track: "microphone" as const,
  userId: "user-77",
};

describe("createWorkspaceMeetingLiveTranscriptAuthorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALIBABA_API_KEY = "sk-test";
    mocks.claimMeetingLiveTranscriptLease.mockResolvedValue("created");
    mocks.gateIssue.mockImplementation((_input: unknown, mint: () => unknown) => mint());
  });

  it("issues a qwen authorization when the DashScope key is present", async () => {
    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(authorization).toMatchObject({ provider: "qwen", track: "microphone" });
    expect(mocks.createQwenRealtimeTranscriptionAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: baseInput.captureId, track: "microphone" }),
      expect.objectContaining({
        apiKey: "sk-test",
        baseUrl: "https://dashscope.aliyuncs.com",
        model: "qwen3-asr-flash-realtime",
      }),
    );
  });

  it("returns unavailable when the DashScope key is missing", async () => {
    delete process.env.ALIBABA_API_KEY;

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(authorization).toBe("unavailable");
    expect(mocks.createQwenRealtimeTranscriptionAuthorization).not.toHaveBeenCalled();
  });

  it("releases the track lease when the provider mint fails", async () => {
    mocks.createQwenRealtimeTranscriptionAuthorization.mockRejectedValue(
      new Error("DashScope 401"),
    );

    await expect(createWorkspaceMeetingLiveTranscriptAuthorization(baseInput)).rejects.toThrow(
      "DashScope 401",
    );
    expect(mocks.releaseMeetingLiveTranscriptTrackLease).toHaveBeenCalledWith(baseInput);
  });
});
