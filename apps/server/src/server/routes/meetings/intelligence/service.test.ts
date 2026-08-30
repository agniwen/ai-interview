import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSavedMeetingIntelligence, regenerateSavedMeetingIntelligence } from "./service";
import type { MeetingIntelligenceDependencies } from "./service";

const mocks = {
  enqueueMeetingIntelligenceJobs: vi.fn(),
  getMeetingIntelligenceGeneratorSnapshot: vi.fn(() => ({
    model: "provider/model",
    provider: "provider",
  })),
  isMeetingIntelligenceQueueConfigured: vi.fn(() => true),
  loadMeetingAccess: vi.fn(),
  loadMeetingIntelligenceResult: vi.fn(),
  recordMeetingAudit: vi.fn(),
  requestMeetingIntelligenceRun: vi.fn(),
};

const dependencies: MeetingIntelligenceDependencies = mocks;

describe("Meeting Intelligence service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMeetingIntelligenceQueueConfigured.mockReturnValue(true);
    mocks.loadMeetingAccess.mockResolvedValue({ role: "owner" });
    mocks.loadMeetingIntelligenceResult.mockResolvedValue({
      canRegenerate: false,
      current: null,
      error: null,
      history: [],
      state: "pending",
      suggestedTemplate: "general",
    });
    mocks.requestMeetingIntelligenceRun.mockResolvedValue({ processingRunId: "run-80" });
  });

  it("lets the Meeting Owner manually regenerate a selected template", async () => {
    await expect(
      regenerateSavedMeetingIntelligence(
        {
          meetingId: "meeting-80",
          memberRole: "member",
          organizationId: "org-80",
          template: "recruiting-interview",
          userId: "owner-80",
        },
        dependencies,
      ),
    ).resolves.toEqual({ state: "processing" });
    expect(mocks.requestMeetingIntelligenceRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "owner-80",
        requestKind: "manual",
        template: "recruiting-interview",
      }),
    );
    expect(mocks.enqueueMeetingIntelligenceJobs).toHaveBeenCalledWith([
      { processingRunId: "run-80" },
    ]);
  });

  it("keeps Editor and Viewer read-only", async () => {
    mocks.loadMeetingAccess.mockResolvedValue({ role: "editor" });
    await expect(
      regenerateSavedMeetingIntelligence(
        {
          meetingId: "meeting-80",
          memberRole: "member",
          organizationId: "org-80",
          template: "general",
          userId: "editor-80",
        },
        dependencies,
      ),
    ).resolves.toBe("forbidden");
    expect(mocks.requestMeetingIntelligenceRun).not.toHaveBeenCalled();
  });

  it("returns current and full history to every authorized meeting reader", async () => {
    await expect(
      getSavedMeetingIntelligence(
        {
          meetingId: "meeting-80",
          memberRole: "member",
          organizationId: "org-80",
          userId: "owner-80",
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ canRegenerate: true, state: "pending" });
  });
});
