import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMeetingRecruitingRecordCandidates: vi.fn(),
  loadAuthorizedMeeting: vi.fn(),
  loadMeetingRecruitingContext: vi.fn(),
  loadMeetingRecruitingRecordCandidate: vi.fn(),
  meetingRole: vi.fn(),
  replaceMeetingRecruitingContext: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
}));

vi.mock("./authorized-meeting", () => ({
  loadAuthorizedMeeting: mocks.loadAuthorizedMeeting,
  meetingRole: mocks.meetingRole,
}));
vi.mock("./recruiting-context-dao", () => ({
  listMeetingRecruitingRecordCandidates: mocks.listMeetingRecruitingRecordCandidates,
  loadMeetingRecruitingContext: mocks.loadMeetingRecruitingContext,
  loadMeetingRecruitingRecordCandidate: mocks.loadMeetingRecruitingRecordCandidate,
  replaceMeetingRecruitingContext: mocks.replaceMeetingRecruitingContext,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  changeMeetingRecruitingContext,
  getMeetingRecruitingContext,
  getMeetingRecruitingRecordCandidates,
} from "./recruiting-context-service";

const baseInput = {
  canReadRecruitingRecords: true,
  meetingId: "meeting-1",
  memberRole: "member",
  organizationId: "org-1",
  userId: "user-1",
};

describe("Meeting Recruiting Context permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAuthorizedMeeting.mockResolvedValue({ id: "meeting-1" });
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({ kind: "all" });
    mocks.loadMeetingRecruitingContext.mockResolvedValue(null);
    mocks.loadMeetingRecruitingRecordCandidate.mockResolvedValue({ id: "candidate-1" });
    mocks.replaceMeetingRecruitingContext.mockResolvedValue("updated");
  });

  it.each(["editor", "viewer"] as const)("does not let a %s change the link", async (role) => {
    mocks.meetingRole.mockReturnValue(role);

    await expect(
      changeMeetingRecruitingContext({
        ...baseInput,
        recruitingRecordId: "candidate-1",
      }),
    ).resolves.toBe("forbidden");
    expect(mocks.replaceMeetingRecruitingContext).not.toHaveBeenCalled();
  });

  it("does not reveal an inaccessible recruiting record to an Owner", async () => {
    mocks.meetingRole.mockReturnValue("owner");
    mocks.loadMeetingRecruitingRecordCandidate.mockResolvedValue(null);

    await expect(
      changeMeetingRecruitingContext({
        ...baseInput,
        recruitingRecordId: "candidate-outside-scope",
      }),
    ).resolves.toBe("invalid-record");
    expect(mocks.replaceMeetingRecruitingContext).not.toHaveBeenCalled();
  });

  it("lets an Owner remove a stale link without recruiting-record read permission", async () => {
    mocks.meetingRole.mockReturnValue("owner");

    await expect(
      changeMeetingRecruitingContext({
        ...baseInput,
        canReadRecruitingRecords: false,
        recruitingRecordId: null,
      }),
    ).resolves.toBe("updated");
    expect(mocks.replaceMeetingRecruitingContext).toHaveBeenCalledWith(
      expect.objectContaining({ recruitingRecordId: null }),
    );
  });

  it("hides the linked recruiting record when the viewer cannot read it", async () => {
    mocks.meetingRole.mockReturnValue("viewer");

    await expect(
      getMeetingRecruitingContext({ ...baseInput, canReadRecruitingRecords: false }),
    ).resolves.toEqual({ canManage: false, link: null });
    expect(mocks.loadMeetingRecruitingContext).not.toHaveBeenCalled();
  });

  it("lists only visible recruiting candidates for an Owner", async () => {
    mocks.meetingRole.mockReturnValue("owner");
    mocks.listMeetingRecruitingRecordCandidates.mockResolvedValue([{ id: "candidate-1" }]);

    await expect(
      getMeetingRecruitingRecordCandidates({ ...baseInput, limit: 20, search: "Alice" }),
    ).resolves.toEqual([{ id: "candidate-1" }]);
    expect(mocks.listMeetingRecruitingRecordCandidates).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-1",
      search: "Alice",
      visibilityScope: { kind: "all" },
    });
  });
});
