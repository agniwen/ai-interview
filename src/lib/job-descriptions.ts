import type { MinimaxVoiceId } from "@/lib/minimax-voices";
import { z } from "zod";

export const jobDescriptionBaseSchema = z.object({
  departmentId: z.string().trim().min(1, "请选择所属部门"),
  description: z.string().trim().max(500, "描述不能超过 500 字").optional().or(z.literal("")),
  interviewerIds: z
    .array(z.string().trim().min(1))
    .min(1, "请至少选择一位面试官")
    .max(20, "最多只能选择 20 位面试官"),
  name: z.string().trim().min(1, "请输入岗位名称").max(120, "岗位名称不能超过 120 个字符"),
  prompt: z.string().trim().min(1, "请输入岗位 prompt").max(8000, "prompt 不能超过 8000 字"),
});

export const jobDescriptionFormSchema = jobDescriptionBaseSchema;
export const jobDescriptionUpdateSchema = jobDescriptionBaseSchema;

export type JobDescriptionFormValues = z.infer<typeof jobDescriptionFormSchema>;
export type JobDescriptionUpdateValues = z.infer<typeof jobDescriptionUpdateSchema>;

export interface JobDescriptionInterviewerSummary {
  id: string;
  name: string;
  voice: MinimaxVoiceId;
}

export interface JobDescriptionRecord {
  id: string;
  departmentId: string;
  interviewerIds: string[];
  name: string;
  description: string | null;
  prompt: string;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface JobDescriptionListRecord extends JobDescriptionRecord {
  departmentName: string | null;
  interviewers: JobDescriptionInterviewerSummary[];
}
