import { z } from "zod";

export const interviewKeyInformationEvidenceSchema = z.object({
  quote: z.string().min(1).max(500),
  timeInCallSecs: z.number().int().min(0).nullable().optional(),
  turnIndex: z.number().int().min(1).nullable().optional(),
});

const interviewKeyInformationItemSchema = z.object({
  content: z.string().min(1).max(500),
  evidence: z.array(interviewKeyInformationEvidenceSchema).min(1).max(2),
});

export const interviewKeyInformationRiskTypeSchema = z.enum(["observed", "needs_verification"]);

export const interviewKeyInformationSchema = z.object({
  quantitativeInformation: z.array(interviewKeyInformationItemSchema).max(3),
  risks: z
    .array(
      interviewKeyInformationItemSchema.extend({
        type: interviewKeyInformationRiskTypeSchema,
      }),
    )
    .max(3),
  skillEvidence: z.array(interviewKeyInformationItemSchema).max(3),
});

export type InterviewKeyInformation = z.infer<typeof interviewKeyInformationSchema>;
export type InterviewKeyInformationEvidence = z.infer<typeof interviewKeyInformationEvidenceSchema>;
