import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceMeetingLiveTranscriptAuthorization } from "./service";
import type { WorkspaceMeetingLiveTranscriptAuthorizationDependencies } from "./service";

const mocks = {
  claimLease: vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["claimLease"]>(),
  createQwenAuthorization:
    vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["createQwenAuthorization"]>(),
  defaultQwenModel: "qwen-audio-3.0-asr-flash-streaming",
  gateIssue: vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["gateIssue"]>(),
  releaseLease: vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["releaseLease"]>(),
  releaseTrackLease:
    vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["releaseTrackLease"]>(),
  renewLease: vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["renewLease"]>(),
  resolveQwenBaseUrl:
    vi.fn<WorkspaceMeetingLiveTranscriptAuthorizationDependencies["resolveQwenBaseUrl"]>(),
} satisfies WorkspaceMeetingLiveTranscriptAuthorizationDependencies;

const dependencies = mocks;

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
    mocks.claimLease.mockResolvedValue("created");
    mocks.createQwenAuthorization.mockResolvedValue({
      baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      clientSecret: "st-temp-token",
      expiresAt: "2026-08-09T01:21:00.000Z",
      model: "qwen-audio-3.0-asr-flash-streaming",
      provider: "qwen",
      track: "microphone",
    });
    mocks.gateIssue.mockImplementation((_input, mint) => mint());
    mocks.releaseTrackLease.mockImplementation(() => Promise.resolve());
    mocks.resolveQwenBaseUrl.mockReturnValue("https://dashscope.aliyuncs.com");
  });

  it("issues a qwen authorization when the DashScope key is present", async () => {
    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(
      baseInput,
      dependencies,
    );

    expect(authorization).toMatchObject({ provider: "qwen", track: "microphone" });
    expect(mocks.createQwenAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: baseInput.captureId, track: "microphone" }),
      expect.objectContaining({
        apiKey: "sk-test",
        baseUrl: "https://dashscope.aliyuncs.com",
        model: "qwen-audio-3.0-asr-flash-streaming",
      }),
    );
  });

  it("returns unavailable when the DashScope key is missing", async () => {
    delete process.env.ALIBABA_API_KEY;

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(
      baseInput,
      dependencies,
    );

    expect(authorization).toBe("unavailable");
    expect(mocks.createQwenAuthorization).not.toHaveBeenCalled();
  });

  it("releases the track lease when the provider mint fails", async () => {
    mocks.createQwenAuthorization.mockRejectedValue(new Error("DashScope 401"));

    await expect(
      createWorkspaceMeetingLiveTranscriptAuthorization(baseInput, dependencies),
    ).rejects.toThrow("DashScope 401");
    expect(mocks.releaseTrackLease).toHaveBeenCalledWith(baseInput);
  });
});
