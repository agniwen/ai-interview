import { z } from "zod";
import { minimaxVoiceSchema } from "@/lib/minimax-voices";
import type { MinimaxVoiceId } from "@/lib/minimax-voices";

export const interviewerBaseSchema = z.object({
  departmentId: z.string().trim().min(1, "请选择所属部门"),
  description: z.string().trim().max(500, "描述不能超过 500 字").optional().or(z.literal("")),
  name: z.string().trim().min(1, "请输入面试官名称").max(120, "名称不能超过 120 个字符"),
  prompt: z.string().trim().min(1, "请输入面试官 prompt").max(8000, "prompt 不能超过 8000 字"),
  voice: minimaxVoiceSchema,
});

export const interviewerFormSchema = interviewerBaseSchema;
export const interviewerUpdateSchema = interviewerBaseSchema;

export type InterviewerFormValues = z.infer<typeof interviewerFormSchema>;
export type InterviewerUpdateValues = z.infer<typeof interviewerUpdateSchema>;

export interface InterviewerRecord {
  id: string;
  departmentId: string;
  name: string;
  description: string | null;
  prompt: string;
  voice: MinimaxVoiceId;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface InterviewerListRecord extends InterviewerRecord {
  departmentName: string | null;
  jobDescriptionCount: number;
}
