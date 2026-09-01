import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@arc/shared/studio-pipeline-stages";
import { factory } from "../../../../../../../factory";
import { createOfferDraftsRouter } from "../route";
import type { OfferDraftsRouteDependencies } from "../route";

const mocks = {
  cancelOfferDraft: vi.fn<OfferDraftsRouteDependencies["cancelOfferDraft"]>(),
  createOfferDraft: vi.fn<OfferDraftsRouteDependencies["createOfferDraft"]>(),
  editOfferDraft: vi.fn<OfferDraftsRouteDependencies["editOfferDraft"]>(),
  getHumanInterviewOfferReadinessError:
    vi.fn<OfferDraftsRouteDependencies["getHumanInterviewOfferReadinessError"]>(),
  invalidateStudioInterviewCaches:
    vi.fn<OfferDraftsRouteDependencies["invalidateStudioInterviewCaches"]>(),
  listOfferDrafts: vi.fn<OfferDraftsRouteDependencies["listOfferDrafts"]>(),
  loadHumanInterviewRoundReadiness:
    vi.fn<OfferDraftsRouteDependencies["loadHumanInterviewRoundReadiness"]>(),
  loadOfferCandidate: vi.fn<OfferDraftsRouteDependencies["loadOfferCandidate"]>(),
  maybeAdvanceToOffer: vi.fn<OfferDraftsRouteDependencies["maybeAdvanceToOffer"]>(),
  recordCandidateActivity: vi.fn<OfferDraftsRouteDependencies["recordCandidateActivity"]>(),
  respondOfferDraft: vi.fn<OfferDraftsRouteDependencies["respondOfferDraft"]>(),
  sendOfferDraft: vi.fn<OfferDraftsRouteDependencies["sendOfferDraft"]>(),
};

const permissionCalls: ["offer", "create" | "delete" | "read" | "update"][] = [];
const dependencies: OfferDraftsRouteDependencies = {
  ...mocks,
  requireOfferPermission: (action) => {
    permissionCalls.push(["offer", action]);
    return factory.createMiddleware(async (c, next) => {
      if (c.req.header("x-test-permission") === "deny") {
        return c.json({ message: "Forbidden" }, 403);
      }
      return await next();
    });
  },
};

const offerDraftsRouter = createOfferDraftsRouter(dependencies);

const ORG_ID = "org_offer_routes";
const RECORD_ID = "candidate_offer_routes";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORG_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "operator-1" } as never);
      await next();
    })
    .route("/:id/offer-drafts", offerDraftsRouter);
}

const offer: OfferDraftRecord = {
  baseSalary: 30_000,
  bonus: null,
  candidateCounter: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  currency: "CNY",
  equity: null,
  expiresAt: null,
  id: "offer-1",
  interviewRecordId: RECORD_ID,
  joiningDate: null,
  notes: null,
  organizationId: ORG_ID,
  position: "高级前端",
  responseAt: null,
  sentAt: null,
  status: "draft",
  updatedAt: "2026-08-18T00:00:00.000Z",
  version: 1,
};

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
    expect(permissionCalls).toEqual([
      ["offer", "read"],
      ["offer", "create"],
      ["offer", "update"],
      ["offer", "update"],
      ["offer", "update"],
      ["offer", "delete"],
    ]);
  });

  it("lists drafts through the mounted candidate path", async () => {
    mocks.listOfferDrafts.mockResolvedValue([offer]);

    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([offer]);
    expect(mocks.listOfferDrafts).toHaveBeenCalledWith(RECORD_ID, ORG_ID);
  });

  it("blocks offer creation until human interview rounds are ready", async () => {
    mocks.loadOfferCandidate.mockResolvedValue({ id: RECORD_ID, pipelineStage: "human_interview" });
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
    mocks.loadOfferCandidate.mockResolvedValue({ id: RECORD_ID, pipelineStage: "human_interview" });
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
