import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  listSavedMeetings: vi.fn(),
  loadResumeDetail: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/service", () => ({
  listSavedMeetings: mocks.listSavedMeetings,
}));
vi.mock("../../dao/resumes", () => ({ loadResumeDetail: mocks.loadResumeDetail }));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy", () => ({
  createRequestWorkspaceAuthorizer: () => () => Promise.resolve(true),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { recruitingRecordMeetingsRouter } from "./route";

function makeClient() {
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-79" } as never);
      c.set("member", { role: "member" } as never);
      c.set("user", { id: "user-79" } as never);
      await next();
    })
    .route("/resumes/:id/meetings", recruitingRecordMeetingsRouter);
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
