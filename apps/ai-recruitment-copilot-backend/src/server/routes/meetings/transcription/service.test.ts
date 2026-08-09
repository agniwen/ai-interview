import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  resetMeetingTranscriptionForRetry: vi.fn(),
  retryMeetingTranscriptionJob: vi.fn(),
  updateMeetingTranscriptionPolicy: vi.fn(),
}));

vi.mock("./dao", () => mocks);
vi.mock("./revision-dao", () => mocks);
vi.mock("./provider-registry", () => mocks);
vi.mock("../dao", () => mocks);
vi.mock("@arc/meeting-processing-queue/meeting-transcription", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  correctSavedMeetingTranscript,
  getSavedMeetingTranscript,
  getSavedMeetingTranscriptHistory,
  getSavedMeetingTranscriptRevision,
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
        policy: { allowedProviders: ["openai"], selectedProvider: "openai" },
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
        policy: { allowedProviders: ["openai"], selectedProvider: "openai" },
        userId: "admin-76",
      }),
    ).resolves.toBe("invalid-provider");
  });

  it("persists an explicit policy and enqueues only recoverable final jobs", async () => {
    mocks.updateMeetingTranscriptionPolicy.mockResolvedValue({
      allowedProviders: ["openai"],
      revision: 2,
      selectedProvider: "openai",
    });
    mocks.listRecoverableMeetingTranscriptionJobs.mockResolvedValue([{ meetingId: "meeting-76" }]);

    await expect(
      updateWorkspaceMeetingTranscriptionPolicy({
        memberRole: "admin",
        organizationId: "org-76",
        policy: { allowedProviders: ["openai"], selectedProvider: "openai" },
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
    mocks.getMeetingTranscriptionJobForMeeting.mockResolvedValue({ meetingId: "meeting-76" });

    await expect(
      retrySavedMeetingTranscription({
        meetingId: "meeting-76",
        memberRole: "member",
        organizationId: "org-76",
        userId: "owner-76",
      }),
    ).resolves.toEqual({ state: "processing" });
    expect(mocks.retryMeetingTranscriptionJob).toHaveBeenCalledWith({ meetingId: "meeting-76" });
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
