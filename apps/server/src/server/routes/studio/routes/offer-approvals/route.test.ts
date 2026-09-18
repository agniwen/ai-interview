/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, require-await -- The test-only adapters deliberately narrow router dependency types and return Hono middleware synchronously. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../factory";
import { createOfferApprovalsRouter } from "./route";
import type { OfferApprovalsRouteDependencies } from "./route";

const actor = { organizationId: "org-1", userId: "user-1" };
const mocks = {
  decideOfferApproval: vi.fn<OfferApprovalsRouteDependencies["decideOfferApproval"]>(),
  getOfferApproval: vi.fn<OfferApprovalsRouteDependencies["getOfferApproval"]>(),
  listApprovers: vi.fn<OfferApprovalsRouteDependencies["listApprovers"]>(),
  listOfferApprovals: vi.fn<OfferApprovalsRouteDependencies["listOfferApprovals"]>(),
  notifyOfferApproval: vi.fn<OfferApprovalsRouteDependencies["notifyOfferApproval"]>(),
  previewOfferApproval: vi.fn<OfferApprovalsRouteDependencies["previewOfferApproval"]>(),
  submitOfferApproval: vi.fn<OfferApprovalsRouteDependencies["submitOfferApproval"]>(),
  withdrawOfferApproval: vi.fn<OfferApprovalsRouteDependencies["withdrawOfferApproval"]>(),
};

const permissionCalls: [string, string][] = [];
const dependencies: OfferApprovalsRouteDependencies = {
  ...mocks,
  getActor: (() => actor) as OfferApprovalsRouteDependencies["getActor"],
  requirePermission: ((resource: string, action: string) => {
    permissionCalls.push([resource, action]);
    return factory.createMiddleware(async (_c, next) => next());
  }) as OfferApprovalsRouteDependencies["requirePermission"],
};

const router = createOfferApprovalsRouter(dependencies);

describe("offerApprovalsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("declares an independent page gate and action-specific approval permissions", () => {
    expect(permissionCalls).toEqual([
      ["page", "offerApprovals"],
      ["offerApproval", "create"],
      ["offerApproval", "create"],
      ["offerApproval", "read"],
      ["offerApproval", "create"],
      ["offerApproval", "read"],
      ["offerApproval", "decide"],
    ]);
  });

  it("passes the immutable approval preconditions to the submit command", async () => {
    mocks.submitOfferApproval.mockResolvedValue({ approvalId: "approval-1" });
    const payload = {
      approverIds: ["approver-1", "approver-2"],
      expectedContentRevision: 3,
      expectedSnapshotHash: "a".repeat(64),
      offerId: "offer-1",
      reason: "预算和入职日期已确认",
      recruitingRecordId: "record-1",
      requestId: "00000000-0000-4000-8000-000000000001",
    };

    const response = await router.request("/", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approvalId: "approval-1" });
    expect(mocks.submitOfferApproval).toHaveBeenCalledWith(actor, payload);
  });

  it("rejects an approval rejection without a reason before invoking the command", async () => {
    const response = await router.request("/approval-1/steps/step-1/decision", {
      body: JSON.stringify({
        comment: "",
        decision: "rejected",
        requestId: "00000000-0000-4000-8000-000000000002",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(mocks.decideOfferApproval).not.toHaveBeenCalled();
  });

  it("keeps manual notification retry separate from a reminder", async () => {
    mocks.notifyOfferApproval.mockResolvedValue({ approvalId: "approval-1" });
    const response = await router.request("/approval-1/retry-notification", {
      body: JSON.stringify({
        eventId: "event-1",
        requestId: "00000000-0000-4000-8000-000000000003",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.notifyOfferApproval).toHaveBeenCalledWith(
      actor,
      "approval-1",
      "retry",
      expect.objectContaining({ eventId: "event-1" }),
    );
  });
});
