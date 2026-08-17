import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createRecruitingRecordMeetingsRouter } from "./route";
import type { RecruitingRecordMeetingsDependencies } from "./route";

const mocks = {
  listSavedMeetings: vi.fn<RecruitingRecordMeetingsDependencies["listSavedMeetings"]>(),
  loadResumeDetail: vi.fn<RecruitingRecordMeetingsDependencies["loadResumeDetail"]>(),
  resolveRecruitingVisibilityScope:
    vi.fn<RecruitingRecordMeetingsDependencies["resolveRecruitingVisibilityScope"]>(),
};

const dependencies: RecruitingRecordMeetingsDependencies = {
  ...mocks,
  permissionMiddleware: async (_c, next) => {
    await next();
  },
};

function makeClient() {
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: "org-79" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "member" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "user-79" } as never);
      await next();
    })
    .route("/resumes/:id/meetings", createRecruitingRecordMeetingsRouter(dependencies));
  return testClient(app);
}

describe("candidate Recruiting Context meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({
      kind: "restricted",
      userIds: ["user-79"],
    });
  });

  it("returns only Meeting Sessions visible to the candidate viewer", async () => {
    mocks.loadResumeDetail.mockResolvedValue({ id: "candidate-79" });
    mocks.listSavedMeetings.mockResolvedValue([{ id: "meeting-79" }]);

    const response = await makeClient().resumes[":id"].meetings.$get({
      param: { id: "candidate-79" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ records: [{ id: "meeting-79" }] });
    expect(mocks.listSavedMeetings).toHaveBeenCalledWith({
      memberRole: "member",
      organizationId: "org-79",
      recruitingRecordId: "candidate-79",
      userId: "user-79",
    });
  });

  it("uses the same not-found response for an inaccessible candidate", async () => {
    mocks.loadResumeDetail.mockResolvedValue(null);

    const response = await makeClient().resumes[":id"].meetings.$get({
      param: { id: "foreign-candidate" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "记录不存在。" });
    expect(mocks.listSavedMeetings).not.toHaveBeenCalled();
  });
});
