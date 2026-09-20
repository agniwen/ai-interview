import { z } from "zod";

/** Ordered keys are the canonical v1 hash representation. Internal notes never enter the public DTO. */
export const offerApprovalSnapshotSchema = z.object({
  baseSalary: z.number(),
  bonus: z.number().nullable(),
  candidateId: z.string(),
  candidateName: z.string(),
  companyName: z.string(),
  currency: z.string(),
  equity: z.string().nullable(),
  expiresAt: z.string().nullable(),
  jobDescriptionId: z.string().nullable(),
  joiningDate: z.string().nullable(),
  notes: z.string().nullable(),
  organizationId: z.string(),
  position: z.string(),
  recruitingRecordId: z.string(),
  schemaVersion: z.literal(1),
});
export type OfferApprovalSnapshot = z.infer<typeof offerApprovalSnapshotSchema>;
export type OfferApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn" | "cancelled";
export type OfferApprovalStepStatus = "waiting" | "pending" | "approved" | "rejected" | "cancelled";

export const offerApprovalTemplateNodeSchema = z
  .object({
    fixedUserId: z.string().min(1).nullable().default(null),
    id: z.string().min(1),
    resolverType: z.enum(["fixed_member", "job_reporting_manager", "recruiting_owner"]),
  })
  .superRefine((node, context) => {
    if (node.resolverType === "fixed_member" && !node.fixedUserId) {
      context.addIssue({
        code: "custom",
        message: "固定成员节点必须选择审批人",
        path: ["fixedUserId"],
      });
    }
    if (node.resolverType !== "fixed_member" && node.fixedUserId) {
      context.addIssue({
        code: "custom",
        message: "动态节点不能保存固定成员",
        path: ["fixedUserId"],
      });
    }
  });

export type OfferApprovalTemplateNode = z.infer<typeof offerApprovalTemplateNodeSchema>;
export type OfferApprovalStepSourceType = OfferApprovalTemplateNode["resolverType"] | "manual";

export interface OfferApprovalStepSourceSnapshot {
  resolverType: OfferApprovalTemplateNode["resolverType"] | null;
  templateId: string | null;
  templateName: string | null;
  templateNodeId: string | null;
}
