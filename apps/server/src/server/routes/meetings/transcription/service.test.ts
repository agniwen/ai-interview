import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  correctSavedMeetingTranscript,
  getSavedMeetingTranscript,
  getSavedMeetingTranscriptHistory,
  getSavedMeetingTranscriptRevision,
  getWorkspaceMeetingTranscriptionPolicy,
  retrySavedMeetingTranscription,
  updateWorkspaceMeetingTranscriptionPolicy,
} from "./service";
import type { MeetingTranscriptionDependencies, TranscriptionMeetingAccess } from "./service";
import type {
  FinalMeetingTranscriptRevision,
  MeetingTranscriptRevisionSummary,
} from "@app/shared/meeting-transcription";

type MockedMeetingTranscriptionDependencies = {
  [Key in keyof MeetingTranscriptionDependencies]: Mock<MeetingTranscriptionDependencies[Key]>;
};

const mocks: MockedMeetingTranscriptionDependencies = {
  createHumanMeetingTranscriptRevision: vi.fn(),
  enqueueMeetingTranscriptionJobs: vi.fn(),
  getMeetingTranscriptionJobForMeeting: vi.fn(),
  isMeetingTranscriptionQueueConfigured: vi.fn(),
  listMeetingTranscriptRevisions: vi.fn(),
  listMeetingTranscriptionProviderCandidates: vi.fn(),
  listRecoverableMeetingTranscriptionJobs: vi.fn(),
  loadActiveMeetingTranscript: vi.fn(),
  loadMeetingTranscriptRevision: vi.fn(),
  loadMeetingTranscriptionPolicy: vi.fn(),
  loadTranscriptionMeeting: vi.fn(),
  recordMeetingAudit: vi.fn(),
  requestAutomaticMeetingIntelligence: vi.fn(),
  resetMeetingTranscriptionForRetry: vi.fn(),
  restoreMeetingTranscriptionAfterRetryFailure: vi.fn(),
  retryMeetingTranscriptionJob: vi.fn(),
  updateMeetingTranscriptionPolicy: vi.fn(),
};

const candidate = {
  id: "openai" as const,
  label: "OpenAI candidate",
  model: "gpt-4o-transcribe-diarize",
  region: "openai-default",
};

function meetingAccess(
  overrides: Partial<TranscriptionMeetingAccess> = {},
): TranscriptionMeetingAccess {
  return {
    activeTranscriptRevisionId: null,
    liveTranscriptDraft: null,
    role: "viewer",
    transcriptionError: null,
    transcriptionStatus: "ready",
    ...overrides,
  };
}

function transcriptRevision(
  overrides: Partial<FinalMeetingTranscriptRevision> = {},
): FinalMeetingTranscriptRevision {
  return {
    basedOnRevisionId: null,
    createdAt: "2026-08-12T08:00:00.000Z",
    createdBy: null,
    id: "revision-76",
    kind: "final",
    language: "zh",
    model: "qwen3-asr-flash-filetrans",
    provider: "qwen",
    region: "qwen-cn-beijing",
    revision: 1,
    turns: [],
    ...overrides,
  };
}

function transcriptRevisionSummary(
  overrides: Partial<MeetingTranscriptRevisionSummary> = {},
): MeetingTranscriptRevisionSummary {
  const { turns: _turns, ...summary } = transcriptRevision(overrides);
  return summary;
}

describe("Meeting transcription service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([candidate]);
  });

  it("does not let an ordinary workspace member modify provider policy", async () => {
    await expect(
      updateWorkspaceMeetingTranscriptionPolicy(
        {
          memberRole: "member",
          organizationId: "org-76",
          policy: {
            allowedProviders: ["openai"],
            fallbackProvider: null,
            selectedProvider: "openai",
            selectionReason: "同一授权语料评测后选择 OpenAI。",
          },
          userId: "member-76",
        },
        mocks,
      ),
    ).resolves.toBe("forbidden");
    expect(mocks.updateMeetingTranscriptionPolicy).not.toHaveBeenCalled();
  });

  it("requires administrators to select a deployment-enabled candidate", async () => {
    mocks.listMeetingTranscriptionProviderCandidates.mockReturnValue([]);

    await expect(
      updateWorkspaceMeetingTranscriptionPolicy(
        {
          memberRole: "admin",
          organizationId: "org-76",
          policy: {
            allowedProviders: ["openai"],
            fallbackProvider: null,
            selectedProvider: "openai",
            selectionReason: "同一授权语料评测后选择 OpenAI。",
          },
          userId: "admin-76",
        },
        mocks,
      ),
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
      getWorkspaceMeetingTranscriptionPolicy(
        {
          memberRole: "admin",
          organizationId: "org-76",
        },
        mocks,
      ),
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
      getWorkspaceMeetingTranscriptionPolicy(
        {
          memberRole: "admin",
          organizationId: "org-76",
        },
        mocks,
      ),
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
    mocks.listRecoverableMeetingTranscriptionJobs.mockResolvedValue([
      {
        meetingId: "meeting-76",
        model: "gpt-4o-transcribe-diarize",
        organizationId: "org-76",
        pipelineVersion: "final-v1",
        policyRevision: 2,
        provider: "openai",
        region: "openai-default",
        sourceManifestSha256: "a".repeat(64),
      },
    ]);

    await expect(
      updateWorkspaceMeetingTranscriptionPolicy(
        {
          memberRole: "admin",
          organizationId: "org-76",
          policy: {
            allowedProviders: ["openai"],
            fallbackProvider: null,
            selectedProvider: "openai",
            selectionReason: "同一授权语料评测后选择 OpenAI。",
          },
          userId: "admin-76",
        },
        mocks,
      ),
    ).resolves.toMatchObject({ revision: 2, selectedProvider: "openai" });
    expect(mocks.enqueueMeetingTranscriptionJobs).toHaveBeenCalledWith([
      expect.objectContaining({ meetingId: "meeting-76" }),
    ]);
  });

  it("returns the final machine revision only after meeting access is authorized", async () => {
    const liveTranscriptDraft = {
      capturedAt: "2026-08-12T08:00:00.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [],
      turns: [],
    };
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        activeTranscriptRevisionId: "revision-76",
        liveTranscriptDraft,
      }),
    );
    mocks.loadActiveMeetingTranscript.mockResolvedValue(transcriptRevision());

    await expect(
      getSavedMeetingTranscript(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "viewer-76",
        },
        mocks,
      ),
    ).resolves.toMatchObject({
      draft: liveTranscriptDraft,
      revision: { id: "revision-76" },
      state: "ready",
    });
  });

  it("keeps the active final revision visible while regeneration is processing", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        activeTranscriptRevisionId: "revision-76",
        role: "owner",
        transcriptionStatus: "processing",
      }),
    );
    mocks.loadActiveMeetingTranscript.mockResolvedValue(transcriptRevision());

    await expect(
      getSavedMeetingTranscript(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "owner-76",
        },
        mocks,
      ),
    ).resolves.toMatchObject({ revision: { id: "revision-76" }, state: "processing" });
  });

  it("lets an owner explicitly retry a failed final transcription", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        role: "owner",
        transcriptionStatus: "failed",
      }),
    );
    mocks.isMeetingTranscriptionQueueConfigured.mockReturnValue(true);
    mocks.resetMeetingTranscriptionForRetry.mockResolvedValue([{ id: "meeting-76" }]);
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue({
      meetingId: "meeting-76",
      model: "qwen3-asr-flash-filetrans",
      organizationId: "org-76",
      pipelineVersion: "final-v1",
      policyRevision: 1,
      provider: "qwen",
      region: "qwen-cn-beijing",
      sourceManifestSha256: "a".repeat(64),
    });

    await expect(
      retrySavedMeetingTranscription(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "owner-76",
        },
        mocks,
      ),
    ).resolves.toEqual({ state: "processing" });
    expect(mocks.retryMeetingTranscriptionJob).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: "meeting-76", provider: "qwen" }),
    );
    expect(mocks.getMeetingTranscriptionJobForMeeting).toHaveBeenCalledWith({
      allowTerminalStatus: true,
      meetingId: "meeting-76",
      organizationId: "org-76",
    });
  });

  it("regenerates a ready final transcript from the complete saved audio", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        activeTranscriptRevisionId: "revision-76",
        role: "owner",
        transcriptionStatus: "ready",
      }),
    );
    mocks.isMeetingTranscriptionQueueConfigured.mockReturnValue(true);
    mocks.resetMeetingTranscriptionForRetry.mockResolvedValue([{ id: "meeting-76" }]);
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue({
      meetingId: "meeting-76",
      model: "qwen-audio-3.0-asr-flash-filetrans",
      organizationId: "org-76",
      pipelineVersion: "final-v1",
      policyRevision: 1,
      provider: "qwen",
      region: "qwen-cn-beijing",
      sourceManifestSha256: "b".repeat(64),
    });

    await expect(
      retrySavedMeetingTranscription(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "owner-76",
        },
        mocks,
      ),
    ).resolves.toEqual({ state: "processing" });
    expect(mocks.resetMeetingTranscriptionForRetry).toHaveBeenCalledWith({
      meetingId: "meeting-76",
      organizationId: "org-76",
    });
    expect(mocks.retryMeetingTranscriptionJob).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-76",
        model: "qwen-audio-3.0-asr-flash-filetrans",
        provider: "qwen",
      }),
    );
  });

  it("keeps a ready transcript authoritative when regeneration cannot build a job", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        activeTranscriptRevisionId: "revision-76",
        role: "owner",
        transcriptionStatus: "ready",
      }),
    );
    mocks.isMeetingTranscriptionQueueConfigured.mockReturnValue(true);
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue(null);

    await expect(
      retrySavedMeetingTranscription(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "owner-76",
        },
        mocks,
      ),
    ).resolves.toEqual({ state: "unavailable" });
    expect(mocks.resetMeetingTranscriptionForRetry).not.toHaveBeenCalled();
  });

  it("restores the ready transcript when regeneration enqueue fails", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(
      meetingAccess({
        activeTranscriptRevisionId: "revision-76",
        role: "owner",
        transcriptionStatus: "ready",
      }),
    );
    mocks.isMeetingTranscriptionQueueConfigured.mockReturnValue(true);
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue({
      meetingId: "meeting-76",
      model: "qwen-audio-3.0-asr-flash-filetrans",
      organizationId: "org-76",
      pipelineVersion: "final-v1",
      policyRevision: 1,
      provider: "qwen",
      region: "qwen-cn-beijing",
      sourceManifestSha256: "b".repeat(64),
    });
    mocks.resetMeetingTranscriptionForRetry.mockResolvedValue([{ id: "meeting-76" }]);
    mocks.retryMeetingTranscriptionJob.mockRejectedValue(new Error("queue unavailable"));

    await expect(
      retrySavedMeetingTranscription(
        {
          meetingId: "meeting-76",
          memberRole: "member",
          organizationId: "org-76",
          userId: "owner-76",
        },
        mocks,
      ),
    ).rejects.toThrow("queue unavailable");
    expect(mocks.restoreMeetingTranscriptionAfterRetryFailure).toHaveBeenCalledWith({
      meetingId: "meeting-76",
      organizationId: "org-76",
      transcriptionError: null,
      transcriptionStatus: "ready",
    });
  });

  it.each(["editor", "owner", "administrator"] as const)(
    "lets a %s create a human correction from the active revision",
    async (role) => {
      mocks.loadTranscriptionMeeting.mockResolvedValue(
        meetingAccess({
          activeTranscriptRevisionId: "00000000-0000-4000-8000-000000000078",
          role,
        }),
      );
      mocks.createHumanMeetingTranscriptRevision.mockResolvedValue(
        transcriptRevision({
          id: "revision-human-78",
          kind: "human",
        }),
      );

      await expect(
        correctSavedMeetingTranscript(
          {
            correction: {
              language: "zh",
              sourceRevisionId: "00000000-0000-4000-8000-000000000078",
              turns: [],
            },
            meetingId: "meeting-78",
            memberRole: role === "administrator" ? "admin" : "member",
            organizationId: "org-78",
            userId: "actor-78",
          },
          mocks,
        ),
      ).resolves.toMatchObject({ id: "revision-human-78", kind: "human" });
      expect(mocks.requestAutomaticMeetingIntelligence).toHaveBeenCalledWith({
        meetingId: "meeting-78",
        organizationId: "org-78",
      });
    },
  );

  it("does not let a viewer correct the transcript", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(meetingAccess());

    await expect(
      correctSavedMeetingTranscript(
        {
          correction: {
            language: "zh",
            sourceRevisionId: "00000000-0000-4000-8000-000000000078",
            turns: [],
          },
          meetingId: "meeting-78",
          memberRole: "member",
          organizationId: "org-78",
          userId: "viewer-78",
        },
        mocks,
      ),
    ).resolves.toBe("forbidden");
    expect(mocks.createHumanMeetingTranscriptRevision).not.toHaveBeenCalled();
  });

  it("returns revision history to every authorized meeting reader", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(meetingAccess());
    mocks.listMeetingTranscriptRevisions.mockResolvedValue([
      transcriptRevisionSummary({ id: "revision-78" }),
    ]);

    await expect(
      getSavedMeetingTranscriptHistory(
        {
          meetingId: "meeting-78",
          memberRole: "member",
          organizationId: "org-78",
          userId: "viewer-78",
        },
        mocks,
      ),
    ).resolves.toMatchObject({ records: [{ id: "revision-78" }] });
  });

  it("loads an immutable historical revision for an authorized viewer", async () => {
    mocks.loadTranscriptionMeeting.mockResolvedValue(meetingAccess());
    mocks.loadMeetingTranscriptRevision.mockResolvedValue(
      transcriptRevision({ id: "revision-machine-78" }),
    );

    await expect(
      getSavedMeetingTranscriptRevision(
        {
          meetingId: "meeting-78",
          memberRole: "member",
          organizationId: "org-78",
          revisionId: "revision-machine-78",
          userId: "viewer-78",
        },
        mocks,
      ),
    ).resolves.toMatchObject({ id: "revision-machine-78" });
  });
});
