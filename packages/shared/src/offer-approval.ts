import { z } from "zod";
import { offerApprovalTemplateNodeSchema } from "@app/db-schema/offer-approval";

export const offerApprovalTemplateInputSchema = z
  .object({
    enabled: z.boolean().default(true),
    name: z.string().trim().min(1).max(100),
    nodes: z.array(offerApprovalTemplateNodeSchema).min(1).max(5),
  })
  .superRefine((input, context) => {
    if (new Set(input.nodes.map((node) => node.id)).size !== input.nodes.length) {
      context.addIssue({ code: "custom", message: "审批节点标识不能重复", path: ["nodes"] });
    }
  });

export const submitOfferApprovalSchema = z.object({
  approverIds: z.array(z.string().min(1)).min(1).max(5),
  expectedContentRevision: z.number().int().positive(),
  expectedSnapshotHash: z.string().length(64),
  offerId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
  recruitingRecordId: z.string().min(1),
  requestId: z.uuid(),
  templateId: z.string().min(1).nullable().default(null),
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
