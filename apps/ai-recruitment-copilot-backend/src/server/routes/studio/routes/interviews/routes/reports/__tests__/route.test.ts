import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  queryInterviewConversationReportsByRound: vi.fn(),
  resolveCandidateIdForRound: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: vi.fn().mockResolvedValue({ kind: "none" }),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-conversations",
  () => ({
    queryInterviewConversationReportsByRound: mocks.queryInterviewConversationReportsByRound,
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds",
  () => ({
    resolveCandidateIdForRound: mocks.resolveCandidateIdForRound,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { reportsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/reports/route";

const ORG_ID = "org_reports_route";
const ROUND_ID = "round_reports_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/:id/reports", reportsRouter);
}

describe("reportsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reports for the round after validating organization scope", async () => {
    mocks.resolveCandidateIdForRound.mockResolvedValue("candidate_1");
    mocks.queryInterviewConversationReportsByRound.mockResolvedValue([{ conversationId: "c1" }]);

    const res = await makeApp().request(`/${ROUND_ID}/reports`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ conversationId: "c1" }]);
    expect(mocks.resolveCandidateIdForRound).toHaveBeenCalledWith(ROUND_ID, ORG_ID, {
      kind: "none",
    });
    expect(mocks.queryInterviewConversationReportsByRound).toHaveBeenCalledWith(ROUND_ID, {
      includeSnapshotMetadata: true,
    });
  });

  it("returns 404 when the round is outside the active organization", async () => {
    mocks.resolveCandidateIdForRound.mockResolvedValue(null);

    const res = await makeApp().request(`/${ROUND_ID}/reports`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "记录不存在。" });
    expect(mocks.queryInterviewConversationReportsByRound).not.toHaveBeenCalled();
  });
});
