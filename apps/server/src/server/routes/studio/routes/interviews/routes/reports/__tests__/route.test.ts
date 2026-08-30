import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@app/server/server/factory";
import { createReportsRouter } from "@app/server/server/routes/studio/routes/interviews/routes/reports/route";

const mocks = {
  queryInterviewConversationReportByRound: vi.fn(),
  queryInterviewConversationReportsByRound: vi.fn(),
  resolveCandidateIdForRound: vi.fn(),
};

const reportsRouter = createReportsRouter({
  queryReport: mocks.queryInterviewConversationReportByRound,
  queryReports: mocks.queryInterviewConversationReportsByRound,
  requireReadPermission: async (_c, next) => await next(),
  resolveCandidateId: mocks.resolveCandidateIdForRound,
});

const ORG_ID = "org_reports_route";
const ROUND_ID = "round_reports_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
      includeKeyInformation: true,
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

  it("returns one selected report within the round", async () => {
    mocks.resolveCandidateIdForRound.mockResolvedValue("candidate_1");
    mocks.queryInterviewConversationReportByRound.mockResolvedValue({
      conversationId: "conversation_2",
    });

    const res = await makeApp().request(`/${ROUND_ID}/reports/conversation_2`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conversationId: "conversation_2" });
    expect(mocks.queryInterviewConversationReportByRound).toHaveBeenCalledWith(
      ROUND_ID,
      "conversation_2",
      { includeKeyInformation: true, includeSnapshotMetadata: true },
    );
  });

  it("returns 404 when the selected report is not part of the round", async () => {
    mocks.resolveCandidateIdForRound.mockResolvedValue("candidate_1");
    mocks.queryInterviewConversationReportByRound.mockResolvedValue(null);

    const res = await makeApp().request(`/${ROUND_ID}/reports/missing`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "面试记录不存在。" });
  });
});
