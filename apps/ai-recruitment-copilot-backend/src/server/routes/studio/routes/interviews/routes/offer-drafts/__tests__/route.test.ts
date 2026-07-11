import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  cancelOfferDraft: vi.fn(),
  createOfferDraft: vi.fn(),
  editOfferDraft: vi.fn(),
  getHumanInterviewOfferReadinessError: vi.fn(),
  invalidateStudioInterviewCaches: vi.fn(),
  limit: vi.fn(),
  listOfferDrafts: vi.fn(),
  loadHumanInterviewRoundReadiness: vi.fn(),
  maybeAdvanceToOffer: vi.fn(),
  permissionCalls: [] as [string, string][],
  recordCandidateActivity: vi.fn(),
  respondOfferDraft: vi.fn(),
  sendOfferDraft: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: (resource: string, action: string) => {
    mocks.permissionCalls.push([resource, action]);
    return (_c: unknown, next: () => Promise<void>) => next();
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.limit }),
      }),
    }),
  },
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds",
  () => ({
    getHumanInterviewOfferReadinessError: mocks.getHumanInterviewOfferReadinessError,
    loadHumanInterviewRoundReadiness: mocks.loadHumanInterviewRoundReadiness,
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/offer-drafts",
  () => ({
    OfferDraftError: class OfferDraftError extends Error {
      override name = "OfferDraftError";
    },
    cancelOfferDraft: mocks.cancelOfferDraft,
    createOfferDraft: mocks.createOfferDraft,
    editOfferDraft: mocks.editOfferDraft,
    listOfferDrafts: mocks.listOfferDrafts,
    maybeAdvanceToOffer: mocks.maybeAdvanceToOffer,
    respondOfferDraft: mocks.respondOfferDraft,
    sendOfferDraft: mocks.sendOfferDraft,
  }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/server/cache-tags", () => ({
  invalidateStudioInterviewCaches: mocks.invalidateStudioInterviewCaches,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/candidate-activity",
  () => ({ recordCandidateActivity: mocks.recordCandidateActivity }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { offerDraftsRouter } from "../route";

const ORG_ID = "org_offer_routes";
const RECORD_ID = "candidate_offer_routes";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORG_ID } as never);
      c.set("user", { id: "operator-1" } as never);
      await next();
    })
    .route("/:id/offer-drafts", offerDraftsRouter);
}

describe("offerDraftsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHumanInterviewOfferReadinessError.mockReturnValue(null);
    mocks.loadHumanInterviewRoundReadiness.mockResolvedValue({
      completedRoundsMissingFeedback: 0,
      pendingRounds: 0,
      totalRounds: 1,
    });
  });

  it("declares CRUD-specific offer permissions", () => {
    expect(mocks.permissionCalls).toEqual([
      ["offer", "read"],
      ["offer", "create"],
      ["offer", "update"],
      ["offer", "update"],
      ["offer", "update"],
      ["offer", "delete"],
    ]);
  });

  it("lists drafts through the mounted candidate path", async () => {
    mocks.listOfferDrafts.mockResolvedValue([{ id: "offer-1" }]);

    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "offer-1" }]);
    expect(mocks.listOfferDrafts).toHaveBeenCalledWith(RECORD_ID, ORG_ID);
  });

  it("blocks offer creation until human interview rounds are ready", async () => {
    mocks.limit.mockResolvedValue([{ id: RECORD_ID, pipelineStage: "human_interview" }]);
    mocks.getHumanInterviewOfferReadinessError.mockReturnValue("请先补全面试评价");

    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts`, {
      body: JSON.stringify({ baseSalary: 30_000, position: "高级前端" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请先补全面试评价" });
    expect(mocks.createOfferDraft).not.toHaveBeenCalled();
  });

  it("preserves audit and cache side effects across offer mutations", async () => {
    const offer = {
      id: "offer-1",
      interviewRecordId: RECORD_ID,
      position: "高级前端",
      version: 1,
    };
    mocks.limit.mockResolvedValue([{ id: RECORD_ID, pipelineStage: "human_interview" }]);
    mocks.createOfferDraft.mockResolvedValue(offer);
    mocks.editOfferDraft.mockResolvedValue(offer);
    mocks.sendOfferDraft.mockResolvedValue(offer);
    mocks.respondOfferDraft.mockResolvedValue(offer);
    mocks.cancelOfferDraft.mockResolvedValue(offer);
    const app = makeApp();

    const responses = [
      await app.request(`/${RECORD_ID}/offer-drafts`, {
        body: JSON.stringify({ baseSalary: 30_000, position: offer.position }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}`, {
        body: JSON.stringify({ position: offer.position }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}/send`, { method: "POST" }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}/respond`, {
        body: JSON.stringify({ response: "accepted" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}/cancel`, { method: "POST" }),
    ];

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(mocks.maybeAdvanceToOffer).toHaveBeenCalledWith(RECORD_ID, ORG_ID);
    expect(mocks.recordCandidateActivity.mock.calls.map(([input]) => input.action)).toEqual([
      "offer_draft_created",
      "offer_draft_updated",
      "offer_draft_sent",
      "offer_draft_responded",
      "offer_draft_cancelled",
    ]);
    expect(mocks.invalidateStudioInterviewCaches).toHaveBeenCalledTimes(5);
  });
});
