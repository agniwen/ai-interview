import { z } from "zod";
export const submitOfferApprovalSchema = z
  .object({
    approverIds: z.array(z.string().min(1)).min(1).max(5),
    expectedContentRevision: z.number().int().positive(),
    expectedSnapshotHash: z.string().length(64),
    offerId: z.string().min(1),
    reason: z.string().trim().min(1).max(2000),
    recruitingRecordId: z.string().min(1),
    requestId: z.uuid(),
  })
  .refine((input) => new Set(input.approverIds).size === input.approverIds.length, {
    message: "审批人不能重复",
    path: ["approverIds"],
  });
export const offerApprovalDecisionSchema = z
  .object({
    comment: z.string().trim().max(2000).default(""),
    decision: z.enum(["approved", "rejected"]),
    requestId: z.uuid(),
  })
  .refine((input) => input.decision !== "rejected" || !!input.comment, {
    message: "驳回理由必填",
    path: ["comment"],
  });
export const offerApprovalWithdrawSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  requestId: z.uuid(),
});
export const offerApprovalNotificationSchema = z.object({
  eventId: z.string().optional(),
  requestId: z.uuid(),
});
export const offerApprovalListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  recordId: z.string().optional(),
  view: z.enum(["pending", "processed", "submitted", "all"]).default("pending"),
});
export const offerApprovalLabels = {
  approved: "已通过",
  cancelled: "已失效",
  pending: "待审批",
  rejected: "已驳回",
  withdrawn: "已撤回",
} as const;
