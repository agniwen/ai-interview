import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenAiRealtimeTranscriptionAuthorization: vi.fn(),
  listMeetingTranscriptionProviderCandidates: vi.fn(),
  loadMeetingTranscriptionPolicy: vi.fn(),
}));

vi.mock("../../transcription/dao", () => mocks);
vi.mock("../../transcription/provider-registry", () => mocks);
vi.mock("../../transcription/providers/openai-realtime", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { createWorkspaceMeetingLiveTranscriptAuthorization } from "./service";

const candidate = {
  id: "openai" as const,
  label: "OpenAI candidate",
  model: "gpt-4o-transcribe-diarize",
  region: "openai-default",
};

describe("Meeting live transcript service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "server-only-key");
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([candidate]);
  });

  it("mints a track-scoped live authorization only under the selected workspace policy", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      revision: 3,
      selectedProvider: "openai",
    });
    mocks.createOpenAiRealtimeTranscriptionAuthorization.mockResolvedValue({
      clientSecret: "ephemeral-secret",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      model: "gpt-4o-mini-transcribe",
      provider: "openai",
      track: "system",
    });

    await expect(
      createWorkspaceMeetingLiveTranscriptAuthorization({
        captureId: "00000000-0000-4000-8000-000000000077",
        organizationId: "org-live-77",
        track: "system",
        userId: "user-live-77",
      }),
    ).resolves.toMatchObject({ clientSecret: "ephemeral-secret", track: "system" });
    expect(mocks.createOpenAiRealtimeTranscriptionAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: "00000000-0000-4000-8000-000000000077",
        safetyIdentifier: expect.not.stringContaining("user-live-77"),
        track: "system",
      }),
      expect.objectContaining({ apiKey: "server-only-key", model: "gpt-4o-mini-transcribe" }),
    );
  });

  it("does not mint a live secret when the workspace has not selected the provider", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: [],
      revision: 0,
      selectedProvider: null,
    });

    await expect(
      createWorkspaceMeetingLiveTranscriptAuthorization({
        captureId: "00000000-0000-4000-8000-000000000077",
        organizationId: "org-live-77",
        track: "microphone",
        userId: "user-live-77",
      }),
    ).resolves.toBe("unavailable");
    expect(mocks.createOpenAiRealtimeTranscriptionAuthorization).not.toHaveBeenCalled();
  });
});
