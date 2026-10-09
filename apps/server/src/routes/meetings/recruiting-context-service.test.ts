import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeMeetingRecruitingContext,
  getMeetingRecruitingContext,
  getMeetingRecruitingRecordCandidates,
} from "./recruiting-context-service";
import type { RecruitingContextServiceDependencies } from "./recruiting-context-service";

const mocks = {
  listCandidates: vi.fn<RecruitingContextServiceDependencies["listCandidates"]>(),
  loadAuthorizedMeeting: vi.fn<RecruitingContextServiceDependencies["loadAuthorizedMeeting"]>(),
  loadContext: vi.fn<RecruitingContextServiceDependencies["loadContext"]>(),
  loadRecordCandidate: vi.fn<RecruitingContextServiceDependencies["loadRecordCandidate"]>(),
  meetingRole: vi.fn<RecruitingContextServiceDependencies["meetingRole"]>(),
  replaceContext: vi.fn<RecruitingContextServiceDependencies["replaceContext"]>(),
  resolveVisibility: vi.fn<RecruitingContextServiceDependencies["resolveVisibility"]>(),
};

const dependencies: RecruitingContextServiceDependencies = mocks;

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
    mocks.loadAuthorizedMeeting.mockResolvedValue({ ownerId: "user-1", visibility: "workspace" });
    mocks.resolveVisibility.mockResolvedValue({ kind: "all" });
    mocks.loadContext.mockResolvedValue(null);
    mocks.loadRecordCandidate.mockResolvedValue({
      candidateName: "候选人",
      id: "candidate-1",
      jobDescriptionName: null,
      outcome: "in_pipeline",
      pipelineStage: "screening",
      targetRole: "前端工程师",
    });
    mocks.replaceContext.mockResolvedValue("updated");
  });

  it.each(["editor", "viewer"] as const)("does not let a %s change the link", async (role) => {
    mocks.meetingRole.mockReturnValue(role);

    await expect(
      changeMeetingRecruitingContext(
        {
          ...baseInput,
          recruitingRecordId: "candidate-1",
        },
        dependencies,
      ),
    ).resolves.toBe("forbidden");
    expect(mocks.replaceContext).not.toHaveBeenCalled();
  });

  it("does not reveal an inaccessible recruiting record to an Owner", async () => {
    mocks.meetingRole.mockReturnValue("owner");
    mocks.loadRecordCandidate.mockResolvedValue(null);

    await expect(
      changeMeetingRecruitingContext(
        {
          ...baseInput,
          recruitingRecordId: "candidate-outside-scope",
        },
        dependencies,
      ),
    ).resolves.toBe("invalid-record");
    expect(mocks.replaceContext).not.toHaveBeenCalled();
  });

  it("lets an Owner remove a stale link without recruiting-record read permission", async () => {
    mocks.meetingRole.mockReturnValue("owner");

    await expect(
      changeMeetingRecruitingContext(
        {
          ...baseInput,
          canReadRecruitingRecords: false,
          recruitingRecordId: null,
        },
        dependencies,
      ),
    ).resolves.toBe("updated");
    expect(mocks.replaceContext).toHaveBeenCalledWith(
      expect.objectContaining({ recruitingRecordId: null }),
    );
  });

  it("hides the linked recruiting record when the viewer cannot read it", async () => {
    mocks.meetingRole.mockReturnValue("viewer");

    await expect(
      getMeetingRecruitingContext({ ...baseInput, canReadRecruitingRecords: false }, dependencies),
    ).resolves.toEqual({ canManage: false, link: null });
    expect(mocks.loadContext).not.toHaveBeenCalled();
  });

  it("lists only visible recruiting candidates for an Owner", async () => {
    mocks.meetingRole.mockReturnValue("owner");
    mocks.listCandidates.mockResolvedValue([
      {
        candidateName: "候选人",
        id: "candidate-1",
        jobDescriptionName: null,
        outcome: "in_pipeline",
        pipelineStage: "screening",
        targetRole: "前端工程师",
      },
    ]);

    await expect(
      getMeetingRecruitingRecordCandidates(
        { ...baseInput, limit: 20, search: "Alice" },
        dependencies,
      ),
    ).resolves.toEqual([expect.objectContaining({ candidateName: "候选人", id: "candidate-1" })]);
    expect(mocks.listCandidates).toHaveBeenCalledWith({
      limit: 20,
      organizationId: "org-1",
      search: "Alice",
      visibilityScope: { kind: "all" },
    });
  });
});
