import { describe, expect, it } from "vitest";
import { offerApprovalTemplateInputSchema, submitOfferApprovalSchema } from "./offer-approval";

const submission = {
  approverIds: ["approver"],
  expectedContentRevision: 1,
  expectedSnapshotHash: "a".repeat(64),
  offerId: "offer",
  reason: "申请审批",
  recruitingRecordId: "record",
  requestId: "00000000-0000-4000-8000-000000000001",
  templateId: "template",
};

describe("Offer 审批模板契约", () => {
  it("requires a concrete member for a fixed-member node", () => {
    const result = offerApprovalTemplateInputSchema.safeParse({
      enabled: true,
      name: "默认审批流",
      nodes: [{ fixedUserId: null, id: "node", resolverType: "fixed_member" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts duplicate fixed approvers as separate template nodes", () => {
    const result = offerApprovalTemplateInputSchema.safeParse({
      enabled: true,
      name: "重复审批人",
      nodes: [
        { fixedUserId: "same", id: "first", resolverType: "fixed_member" },
        { fixedUserId: "same", id: "second", resolverType: "fixed_member" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("leaves duplicate approval validation to the selected flow mode", () => {
    expect(
      submitOfferApprovalSchema.safeParse({
        ...submission,
        approverIds: ["same", "same"],
      }).success,
    ).toBe(true);
  });
});
