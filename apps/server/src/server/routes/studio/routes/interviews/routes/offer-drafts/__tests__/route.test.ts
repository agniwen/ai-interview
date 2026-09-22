import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { factory } from "../../../../../../../factory";
import { createOfferDraftsRouter, parseOfferEmailRequest } from "../route";
import type { OfferDraftsRouteDependencies } from "../route";

const mocks = {
  createOfferDraft: vi.fn<OfferDraftsRouteDependencies["createOfferDraft"]>(),
  deleteOfferDraft: vi.fn<OfferDraftsRouteDependencies["deleteOfferDraft"]>(),
  editOfferDraft: vi.fn<OfferDraftsRouteDependencies["editOfferDraft"]>(),
  getHumanInterviewOfferReadinessError:
    vi.fn<OfferDraftsRouteDependencies["getHumanInterviewOfferReadinessError"]>(),
  getOfferApprovalPolicy: vi.fn<OfferDraftsRouteDependencies["getOfferApprovalPolicy"]>(),
  getOfferEmailPreview: vi.fn<OfferDraftsRouteDependencies["getOfferEmailPreview"]>(),
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
  sendOfferEmail: vi.fn<OfferDraftsRouteDependencies["sendOfferEmail"]>(),
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
  contentRevision: 1,
  createdAt: "2026-08-18T00:00:00.000Z",
  currency: "CNY",
  currentApprovalId: null,
  declineReason: null,
  emailRecipient: null,
  emailSentAt: null,
  equity: null,
  expiresAt: null,
  id: "offer-1",
  interviewRecordId: RECORD_ID,
  joiningDate: null,
  notes: null,
  organizationId: ORG_ID,
  position: "高级前端",
  publicPath: null,
  publishedAt: null,
  publishedBy: null,
  responseAt: null,
  responseBy: null,
  responseSource: null,
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
      ["offer", "read"],
      ["offer", "create"],
      ["offer", "update"],
      ["offer", "delete"],
      ["offer", "update"],
      ["offer", "read"],
      ["offer", "read"],
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

  it("reports whether enabled templates require Offer approval", async () => {
    mocks.getOfferApprovalPolicy.mockResolvedValue({ approvalRequired: true });

    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts/approval-policy`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approvalRequired: true });
    expect(mocks.getOfferApprovalPolicy).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });

  it("voids a historical draft with an explicit actor and preserves the cancel contract", async () => {
    mocks.deleteOfferDraft.mockResolvedValue(offer);
    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts/${offer.id}/void`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteOfferDraft).toHaveBeenCalledWith(offer.id, ORG_ID, {
      operatorId: "operator-1",
      voidWithHistory: true,
    });
    mocks.deleteOfferDraft.mockClear();
    const cancel = await makeApp().request(`/${RECORD_ID}/offer-drafts/${offer.id}/cancel`, {
      method: "POST",
    });
    expect(cancel.status).toBe(200);
    expect(mocks.deleteOfferDraft).toHaveBeenCalledWith(offer.id, ORG_ID);
  });

  it("loads email defaults from company and linked-job context", async () => {
    mocks.getOfferEmailPreview.mockResolvedValue({
      content: "邮件内容",
      offerUrl: "https://example.com/offer/token",
      subject: "【示例公司】Offer 通知｜高级前端",
      to: "candidate@example.com",
    });

    const response = await makeApp().request(
      `/${RECORD_ID}/offer-drafts/${offer.id}/email-preview`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      content: "邮件内容",
      offerUrl: "https://example.com/offer/token",
      subject: "【示例公司】Offer 通知｜高级前端",
      to: "candidate@example.com",
    });
    expect(mocks.getOfferEmailPreview).toHaveBeenCalledWith(offer.id, ORG_ID);
  });

  it("blocks offer creation before the offer node", async () => {
    mocks.loadOfferCandidate.mockResolvedValue({ id: RECORD_ID, pipelineStage: "income_proof" });
    mocks.getHumanInterviewOfferReadinessError.mockReturnValue("请先补全面试评价");

    const response = await makeApp().request(`/${RECORD_ID}/offer-drafts`, {
      body: JSON.stringify({ baseSalary: 30_000, position: "高级前端" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请先完成谈薪并进入发 Offer 节点。" });
    expect(mocks.createOfferDraft).not.toHaveBeenCalled();
  });

  it("preserves audit and cache side effects across offer mutations", async () => {
    mocks.loadOfferCandidate.mockResolvedValue({ id: RECORD_ID, pipelineStage: "offer" });
    mocks.createOfferDraft.mockResolvedValue(offer);
    mocks.editOfferDraft.mockResolvedValue(offer);
    mocks.sendOfferDraft.mockResolvedValue(offer);
    mocks.respondOfferDraft.mockResolvedValue(offer);
    mocks.deleteOfferDraft.mockResolvedValue(offer);
    const app = makeApp();

    const responses = [
      await app.request(`/${RECORD_ID}/offer-drafts`, {
        body: JSON.stringify({ baseSalary: 30_000, position: offer.position }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}`, {
        body: JSON.stringify({
          expectedContentRevision: offer.contentRevision,
          position: offer.position,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
      await app.request(`/${RECORD_ID}/offer-drafts/${offer.id}/publish`, { method: "POST" }),
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
      "offer_published",
      "offer_response_recorded_by_hr",
      "offer_draft_deleted",
    ]);
    expect(mocks.invalidateStudioInterviewCaches).toHaveBeenCalledTimes(5);
  });
});

describe("parseOfferEmailRequest", () => {
  const input = {
    content: "请查看 https://example.com/offer/token",
    subject: "Offer 通知",
    to: "candidate@example.com",
  };

  it("keeps legacy JSON email requests compatible", async () => {
    await expect(
      parseOfferEmailRequest(
        new Request("http://localhost/email", {
          body: JSON.stringify(input),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      ),
    ).resolves.toEqual({ attachments: [], input });
  });

  it("parses multipart email fields and attachments", async () => {
    const body = new FormData();
    for (const [key, value] of Object.entries(input)) {
      body.append(key, value);
    }
    body.append("attachments", new File(["offer"], "录用通知.pdf", { type: "application/pdf" }));

    const result = await parseOfferEmailRequest(
      new Request("http://localhost/email", { body, method: "POST" }),
    );

    expect(result.input).toEqual(input);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.name).toBe("录用通知.pdf");
  });

  it("rejects malformed multipart email fields", async () => {
    const body = new FormData();
    body.append("subject", "Offer 通知");
    await expect(
      parseOfferEmailRequest(new Request("http://localhost/email", { body, method: "POST" })),
    ).rejects.toThrow("邮件参数无效");
  });
});
