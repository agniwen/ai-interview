import { z } from "zod";

export const aiInterviewLinkValiditySchema = z.enum(["permanent", "1_day", "3_days", "7_days"]);

export type AiInterviewLinkValidity = z.infer<typeof aiInterviewLinkValiditySchema>;
