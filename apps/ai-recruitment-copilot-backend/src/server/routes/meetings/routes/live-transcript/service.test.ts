import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceMeetingLiveTranscriptAuthorization } from "./service";

const mocks = vi.hoisted(() => ({
  claimMeetingLiveTranscriptLease: vi.fn().mockResolvedValue("created"),
  createOpenAiRealtimeTranscriptionAuthorization: vi.fn().mockResolvedValue({
    clientSecret: "ephemeral-openai",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "gpt-4o-mini-transcribe",
    provider: "openai",
    track: "microphone",
  }),
  createQwenRealtimeTranscriptionAuthorization: vi.fn().mockResolvedValue({
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    clientSecret: "st-temp-token",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
    track: "microphone",
  }),
  ensureDefaultMeetingTranscriptionPolicy: vi.fn().mockResolvedValue(null),
  gateIssue: vi.fn((_input: unknown, mint: () => unknown) => mint()),
  listMeetingTranscriptionProviderCandidates: vi.fn(),
  loadMeetingTranscriptionPolicy: vi.fn(),
  releaseMeetingLiveTranscriptTrackLease: vi.fn().mockResolvedValue(null),
  resolveMeetingTranscriptionQwenBaseUrl: vi.fn().mockReturnValue("https://dashscope.aliyuncs.com"),
}));

vi.mock("../../transcription/dao", () => ({
  ensureDefaultMeetingTranscriptionPolicy: mocks.ensureDefaultMeetingTranscriptionPolicy,
  loadMeetingTranscriptionPolicy: mocks.loadMeetingTranscriptionPolicy,
}));
vi.mock("../../transcription/provider-endpoint", () => ({
  resolveMeetingTranscriptionQwenBaseUrl: mocks.resolveMeetingTranscriptionQwenBaseUrl,
}));
vi.mock("../../transcription/provider-registry", () => ({
  listMeetingTranscriptionProviderCandidates: mocks.listMeetingTranscriptionProviderCandidates,
}));
vi.mock("../../transcription/providers/openai-realtime", () => ({
  createOpenAiRealtimeTranscriptionAuthorization:
    mocks.createOpenAiRealtimeTranscriptionAuthorization,
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

const qwenCandidate = {
  id: "qwen",
  label: "qwen",
  model: "qwen3-asr-flash-realtime",
  region: "qwen-cn-beijing",
};

function policy(allowedProviders: string[], revision: number) {
  return {
    allowedProviders,
    fallbackProvider: null,
    revision,
    selectedProvider: allowedProviders[0] ?? null,
    selectionReason: null,
  };
}

describe("createWorkspaceMeetingLiveTranscriptAuthorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALIBABA_API_KEY = "sk-test";
    delete process.env.OPENAI_API_KEY;
    mocks.claimMeetingLiveTranscriptLease.mockResolvedValue("created");
    mocks.gateIssue.mockImplementation((_input: unknown, mint: () => unknown) => mint());
  });

  it("materializes the deployment default policy for an unconfigured workspace and issues a qwen authorization", async () => {
    mocks.loadMeetingTranscriptionPolicy
      .mockResolvedValueOnce(policy([], 0))
      .mockResolvedValueOnce(policy(["qwen"], 1));
    mocks.ensureDefaultMeetingTranscriptionPolicy.mockResolvedValue(null);
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([qwenCandidate]);

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(mocks.ensureDefaultMeetingTranscriptionPolicy).toHaveBeenCalledWith("org-77");
    expect(mocks.loadMeetingTranscriptionPolicy).toHaveBeenCalledTimes(2);
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

  it("uses the existing qwen policy without re-materializing", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue(policy(["qwen"], 2));
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([qwenCandidate]);

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(mocks.ensureDefaultMeetingTranscriptionPolicy).not.toHaveBeenCalled();
    expect(authorization).toMatchObject({ provider: "qwen" });
  });

  it("prefers the openai branch when the policy allows openai and a key is present", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue(policy(["openai"], 3));
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([
      {
        id: "openai",
        label: "openai",
        model: "gpt-4o-transcribe-diarize",
        region: "openai-default",
      },
    ]);

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(authorization).toMatchObject({ provider: "openai" });
    expect(mocks.createQwenRealtimeTranscriptionAuthorization).not.toHaveBeenCalled();
  });

  it("returns unavailable when no provider is configured in the deployment", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue(policy([], 0));
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([]);

    const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization(baseInput);

    expect(authorization).toBe("unavailable");
    expect(mocks.ensureDefaultMeetingTranscriptionPolicy).not.toHaveBeenCalled();
  });

  it("releases the track lease when the provider mint fails", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue(policy(["qwen"], 2));
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([qwenCandidate]);
    mocks.createQwenRealtimeTranscriptionAuthorization.mockRejectedValue(
      new Error("DashScope 401"),
    );

    await expect(createWorkspaceMeetingLiveTranscriptAuthorization(baseInput)).rejects.toThrow(
      "DashScope 401",
    );
    expect(mocks.releaseMeetingLiveTranscriptTrackLease).toHaveBeenCalledWith(baseInput);
  });
});
