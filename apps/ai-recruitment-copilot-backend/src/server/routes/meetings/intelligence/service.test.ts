import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueMeetingIntelligenceJobs: vi.fn(),
  getMeetingIntelligenceGeneratorSnapshot: vi.fn(() => ({
    model: "provider/model",
    provider: "provider",
  })),
  isMeetingIntelligenceQueueConfigured: vi.fn(() => true),
  loadAuthorizedMeeting: vi.fn(),
  loadMeetingIntelligenceResult: vi.fn(),
  recordMeetingAudit: vi.fn(),
  requestMeetingIntelligenceRun: vi.fn(),
}));

vi.mock("@arc/meeting-processing-queue/meeting-intelligence", () => ({
  MEETING_INTELLIGENCE_PIPELINE_VERSION: "intelligence-v1",
  MEETING_INTELLIGENCE_PROMPT_VERSION: "meeting-intelligence-v1",
  enqueueMeetingIntelligenceJobs: mocks.enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured: mocks.isMeetingIntelligenceQueueConfigured,
}));
vi.mock("./generator", () => ({
  getMeetingIntelligenceGeneratorSnapshot: mocks.getMeetingIntelligenceGeneratorSnapshot,
}));
vi.mock("./dao", () => ({
  loadMeetingIntelligenceResult: mocks.loadMeetingIntelligenceResult,
  requestMeetingIntelligenceRun: mocks.requestMeetingIntelligenceRun,
}));
vi.mock("../authorized-meeting", () => ({
  loadAuthorizedMeeting: mocks.loadAuthorizedMeeting,
  meetingRole: vi.fn((meeting: { role: string }) => meeting.role),
}));
vi.mock("../dao", () => ({ recordMeetingAudit: mocks.recordMeetingAudit }));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { getSavedMeetingIntelligence, regenerateSavedMeetingIntelligence } from "./service";

describe("Meeting Intelligence service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMeetingIntelligenceQueueConfigured.mockReturnValue(true);
    mocks.loadAuthorizedMeeting.mockResolvedValue({ role: "owner" });
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
      regenerateSavedMeetingIntelligence({
        meetingId: "meeting-80",
        memberRole: "member",
        organizationId: "org-80",
        template: "recruiting-interview",
        userId: "owner-80",
      }),
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
    mocks.loadAuthorizedMeeting.mockResolvedValue({ role: "editor" });
    await expect(
      regenerateSavedMeetingIntelligence({
        meetingId: "meeting-80",
        memberRole: "member",
        organizationId: "org-80",
        template: "general",
        userId: "editor-80",
      }),
    ).resolves.toBe("forbidden");
    expect(mocks.requestMeetingIntelligenceRun).not.toHaveBeenCalled();
  });

  it("returns current and full history to every authorized meeting reader", async () => {
    await expect(
      getSavedMeetingIntelligence({
        meetingId: "meeting-80",
        memberRole: "member",
        organizationId: "org-80",
        userId: "owner-80",
      }),
    ).resolves.toMatchObject({ canRegenerate: true, state: "pending" });
  });
});
