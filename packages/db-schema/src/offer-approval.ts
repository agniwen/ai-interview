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
