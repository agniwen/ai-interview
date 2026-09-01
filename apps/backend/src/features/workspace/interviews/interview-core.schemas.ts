import { z } from "zod";

export const interviewSummaryResponseSchema = z.object({
  completed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  interrupted: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
