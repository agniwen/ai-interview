import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON: "未配置转录策略时默认使用百炼 Qwen ASR",
  DEFAULT_MEETING_TRANSCRIPTION_PROVIDER: "qwen",
  createHumanMeetingTranscriptRevision: vi.fn(),
  enqueueMeetingTranscriptionJobs: vi.fn(),
  getMeetingTranscriptionJobForMeeting: vi.fn(),
  isMeetingTranscriptionQueueConfigured: vi.fn(),
  listMeetingTranscriptRevisions: vi.fn(),
  listMeetingTranscriptionProviderCandidates: vi.fn(),
  listRecoverableMeetingTranscriptionJobs: vi.fn(),
  loadActiveMeetingTranscript: vi.fn(),
  loadMeetingSessionForAccess: vi.fn(),
  loadMeetingTranscriptRevision: vi.fn(),
  loadMeetingTranscriptionPolicy: vi.fn(),
  recordMeetingAudit: vi.fn(),
  requestAutomaticMeetingIntelligence: vi.fn(),
  resetMeetingTranscriptionForRetry: vi.fn(),
  retryMeetingTranscriptionJob: vi.fn(),
  updateMeetingTranscriptionPolicy: vi.fn(),
}));

vi.mock("./dao", () => mocks);
vi.mock("./revision-dao", () => mocks);
vi.mock("./provider-registry", () => mocks);
vi.mock("../dao", () => mocks);
vi.mock("@arc/meeting-processing-queue/meeting-transcription", () => mocks);
vi.mock("../intelligence/service", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  correctSavedMeetingTranscript,
  getSavedMeetingTranscript,
  getSavedMeetingTranscriptHistory,
  getSavedMeetingTranscriptRevision,
  getWorkspaceMeetingTranscriptionPolicy,
  retrySavedMeetingTranscription,
  updateWorkspaceMeetingTranscriptionPolicy,
} from "./service";

const candidate = {
  id: "openai" as const,
  label: "OpenAI candidate",
  model: "gpt-4o-transcribe-diarize",
  region: "openai-default",
};

describe("Meeting transcription service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([candidate]);
  });

  it("does not let an ordinary workspace member modify provider policy", async () => {
    await expect(
      updateWorkspaceMeetingTranscriptionPolicy({
        memberRole: "member",
        organizationId: "org-76",
        policy: {
          allowedProviders: ["openai"],
          fallbackProvider: null,
          selectedProvider: "openai",
          selectionReason: "同一授权语料评测后选择 OpenAI。",
        },
        userId: "member-76",
      }),
    ).resolves.toBe("forbidden");
    expect(mocks.updateMeetingTranscriptionPolicy).not.toHaveBeenCalled();
  });

  it("requires administrators to select a deployment-enabled candidate", async () => {
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([]);

    await expect(
      updateWorkspaceMeetingTranscriptionPolicy({
        memberRole: "admin",
        organizationId: "org-76",
        policy: {
          allowedProviders: ["openai"],
          fallbackProvider: null,
          selectedProvider: "openai",
          selectionReason: "同一授权语料评测后选择 OpenAI。",
        },
        userId: "admin-76",
      }),
    ).resolves.toBe("invalid-provider");
  });

  it("shows Qwen ASR as the default provider when the workspace has no policy", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: [],
      fallbackProvider: null,
      revision: 0,
      selectedProvider: null,
      selectionReason: null,
    });
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([
      {
        id: "qwen",
        label: "通义千问 ASR（百炼 Qwen3-ASR-Flash）",
        model: "qwen3-asr-flash-filetrans",
        region: "qwen-cn-beijing",
      },
    ]);

    await expect(
      getWorkspaceMeetingTranscriptionPolicy({
        memberRole: "admin",
        organizationId: "org-76",
      }),
    ).resolves.toMatchObject({
      allowedProviders: ["qwen"],
      revision: 0,
      selectedProvider: "qwen",
      selectionReason: "未配置转录策略时默认使用百炼 Qwen ASR",
    });
  });

  it("shows the configured policy unchanged once a workspace chooses a provider", async () => {
    mocks.loadMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      fallbackProvider: null,
      revision: 1,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
    });
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([candidate]);

    await expect(
      getWorkspaceMeetingTranscriptionPolicy({
        memberRole: "admin",
        organizationId: "org-76",
      }),
    ).resolves.toMatchObject({
      allowedProviders: ["openai"],
      revision: 1,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
    });
  });

  it("persists an explicit policy and enqueues only recoverable final jobs", async () => {
    mocks.updateMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      fallbackProvider: null,
      revision: 2,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
    });
    mocks.listRecoverableMeetingTranscriptionJobs.mockResolvedValue([{ meetingId: "meeting-76" }]);

    await expect(
      updateWorkspaceMeetingTranscriptionPolicy({
        memberRole: "admin",
        organizationId: "org-76",
        policy: {
          allowedProviders: ["openai"],
          fallbackProvider: null,
          selectedProvider: "openai",
          selectionReason: "同一授权语料评测后选择 OpenAI。",
        },
        userId: "admin-76",
      }),
    ).resolves.toMatchObject({ revision: 2, selectedProvider: "openai" });
    expect(mocks.enqueueMeetingTranscriptionJobs).toHaveBeenCalledWith([
      { meetingId: "meeting-76" },
    ]);
  });

  it("returns the final machine revision only after meeting access is authorized", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      accessGrantRole: "viewer",
      ownerId: "owner-76",
      transcriptionError: null,
      transcriptionStatus: "ready",
      visibility: "restricted",
    });
    mocks.loadActiveMeetingTranscript.mockResolvedValue({ id: "revision-76", turns: [] });

    await expect(
      getSavedMeetingTranscript({
        meetingId: "meeting-76",
        memberRole: "member",
        organizationId: "org-76",
        userId: "viewer-76",
      }),
    ).resolves.toMatchObject({ revision: { id: "revision-76" }, state: "ready" });
  });

  it("lets an owner explicitly retry a failed final transcription", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      accessGrantRole: null,
      custodianId: null,
      ownerId: "owner-76",
      transcriptionStatus: "failed",
      visibility: "restricted",
    });
    mocks.isMeetingTranscriptionQueueConfigured.mockReturnValue(true);
    mocks.resetMeetingTranscriptionForRetry.mockResolvedValue([{ id: "meeting-76" }]);
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue({
      meetingId: "meeting-76",
      provider: "openai",
    });

    await expect(
      retrySavedMeetingTranscription({
        meetingId: "meeting-76",
        memberRole: "member",
        organizationId: "org-76",
        userId: "owner-76",
      }),
    ).resolves.toEqual({ state: "processing" });
    expect(mocks.retryMeetingTranscriptionJob).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: "meeting-76", provider: "openai" }),
    );
    expect(mocks.getMeetingTranscriptionJobForMeeting).toHaveBeenCalledWith({
      meetingId: "meeting-76",
      organizationId: "org-76",
      preferFallback: true,
    });
  });

  it.each(["editor", "owner", "administrator"] as const)(
    "lets a %s create a human correction from the active revision",
    async (role) => {
      mocks.loadMeetingSessionForAccess.mockResolvedValue({
        accessGrantRole: role === "editor" ? "editor" : null,
        activeTranscriptRevisionId: "00000000-0000-4000-8000-000000000078",
        custodianId: null,
        ownerId: role === "owner" ? "actor-78" : "owner-78",
        transcriptionStatus: "ready",
        visibility: "restricted",
      });
      mocks.createHumanMeetingTranscriptRevision.mockResolvedValue({
        id: "revision-human-78",
        kind: "human",
      });

      await expect(
        correctSavedMeetingTranscript({
          correction: {
            language: "zh",
            sourceRevisionId: "00000000-0000-4000-8000-000000000078",
            turns: [],
          },
          meetingId: "meeting-78",
          memberRole: role === "administrator" ? "admin" : "member",
          organizationId: "org-78",
          userId: "actor-78",
        }),
      ).resolves.toMatchObject({ id: "revision-human-78", kind: "human" });
      expect(mocks.requestAutomaticMeetingIntelligence).toHaveBeenCalledWith({
        meetingId: "meeting-78",
        organizationId: "org-78",
      });
    },
  );

  it("does not let a viewer correct the transcript", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      accessGrantRole: "viewer",
      ownerId: "owner-78",
      transcriptionStatus: "ready",
      visibility: "restricted",
    });

    await expect(
      correctSavedMeetingTranscript({
        correction: {
          language: "zh",
          sourceRevisionId: "00000000-0000-4000-8000-000000000078",
          turns: [],
        },
        meetingId: "meeting-78",
        memberRole: "member",
        organizationId: "org-78",
        userId: "viewer-78",
      }),
    ).resolves.toBe("forbidden");
    expect(mocks.createHumanMeetingTranscriptRevision).not.toHaveBeenCalled();
  });

  it("returns revision history to every authorized meeting reader", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      accessGrantRole: "viewer",
      ownerId: "owner-78",
      visibility: "restricted",
    });
    mocks.listMeetingTranscriptRevisions.mockResolvedValue([{ id: "revision-78" }]);

    await expect(
      getSavedMeetingTranscriptHistory({
        meetingId: "meeting-78",
        memberRole: "member",
        organizationId: "org-78",
        userId: "viewer-78",
      }),
    ).resolves.toEqual({ records: [{ id: "revision-78" }] });
  });

  it("loads an immutable historical revision for an authorized viewer", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      accessGrantRole: "viewer",
      ownerId: "owner-78",
      visibility: "restricted",
    });
    mocks.loadMeetingTranscriptRevision.mockResolvedValue({ id: "revision-machine-78" });

    await expect(
      getSavedMeetingTranscriptRevision({
        meetingId: "meeting-78",
        memberRole: "member",
        organizationId: "org-78",
        revisionId: "revision-machine-78",
        userId: "viewer-78",
      }),
    ).resolves.toEqual({ id: "revision-machine-78" });
  });
});
