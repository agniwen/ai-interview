import { z } from "zod";

export const jobRecruitingStatusValues = ["active", "paused", "stopped"] as const;

export const jobRecruitingStatusSchema = z.enum(jobRecruitingStatusValues);

export type JobRecruitingStatus = z.infer<typeof jobRecruitingStatusSchema>;
