import type { MinimaxVoiceId } from "@arc/db-schema/minimax-voices";
import { z } from "zod";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import {
  createDefaultResumeScreeningPolicy,
  resumeScreeningPolicySchema,
} from "./resume-screening";
import type { ResumeScreeningPolicy } from "./resume-screening";
import type { ResumePoolProfileHighlights } from "./resume-pool";

export const jobDescriptionCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === "" || /^[A-Z0-9]{7}$/.test(value), "岗位编码格式无效")
  .transform((value) => value || undefined)
  .optional();

export const jobDescriptionBaseSchema = z.object({
  allowCrossDepartmentInterviewers: z.boolean(),
  code: jobDescriptionCodeSchema,
  departmentId: z.string().trim().min(1, "请选择所属部门"),
  description: z.string().trim().max(500, "描述不能超过 500 字").optional().or(z.literal("")),
  interviewerIds: z
    .array(z.string().trim().min(1))
    .min(1, "请至少选择一位面试官")
    .max(20, "最多只能选择 20 位面试官"),
  name: z.string().trim().min(1, "请输入岗位名称").max(120, "岗位名称不能超过 120 个字符"),
  prompt: z.string().trim().min(1, "请输入岗位 prompt").max(10_000, "prompt 不能超过 10000 字"),
  resumeScreeningPolicy: resumeScreeningPolicySchema,
});

export const jobDescriptionFormSchema = jobDescriptionBaseSchema;
export const jobDescriptionUpdateSchema = jobDescriptionBaseSchema;

export type JobDescriptionFormValues = z.infer<typeof jobDescriptionFormSchema>;
export type JobDescriptionUpdateValues = z.infer<typeof jobDescriptionUpdateSchema>;

export { createDefaultResumeScreeningPolicy };

export interface JobDescriptionInterviewerSummary {
  id: string;
  name: string;
  voice: MinimaxVoiceId;
}

export interface JobDescriptionRecord {
  id: string;
  allowCrossDepartmentInterviewers: boolean;
  code: string | null;
  departmentId: string;
  interviewerIds: string[];
  name: string;
  description: string | null;
  /** @deprecated Replaced by interview-question-templates. Read for legacy data only. */
  presetQuestions: string[];
  prompt: string;
  resumeScreeningPolicy: ResumeScreeningPolicy;
  resumeScreeningPolicyHash: string | null;
  resumeScreeningPolicyVersion: number;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface JobDescriptionListRecord extends JobDescriptionRecord {
  departmentName: string | null;
  interviewers: JobDescriptionInterviewerSummary[];
  // 非归档候选人 / 简历计数；用于列表"简历关联"列。
  // Non-archived candidate count; powers the "resume association" column.
  resumeCount: number;
}

/**
 * 在招岗位管理页头部 chart 的聚合数据。
 * - candidatesByJd：各岗位非归档候选人数 Top 8。
 * - completionByJd：各岗位面试轮次完成率 Top 8（仅纳入存在 schedule 的 JD）。
 * - loadByInterviewer：每位面试官当前承接的进行中 / 待面试候选人数 Top 8。
 *
 * Aggregations for the charts shown above the JD management table.
 * - candidatesByJd: top 8 JDs by non-archived candidate count.
 * - completionByJd: top 8 JDs by completed-rounds / total-rounds ratio; only
 *   JDs whose candidates have schedule rows are included.
 * - loadByInterviewer: top 8 interviewers by active (ready / in_progress)
 *   candidate count, summed across all JDs they are assigned to.
 */
export interface JobDescriptionMetrics {
  candidatesByJd: { id: string; name: string; count: number }[];
  completionByJd: { id: string; name: string; done: number; total: number }[];
  loadByInterviewer: { id: string; name: string; activeCandidates: number }[];
}

export interface JobDescriptionTalentRecommendation {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  createdAt: string;
  currentJobDescriptionId: string | null;
  currentJobDescriptionName: string | null;
  id: string;
  masteredSkills: string[];
  notes: string | null;
  profileHighlights: ResumePoolProfileHighlights;
  reasons: string[];
  resumeFileName: string | null;
  resumeParseStatus: ResumeParseStatus;
  score: number;
  similarity: {
    resumeOverview?: number;
    skillRole?: number;
    workProject?: number;
  };
  targetRole: string | null;
  workYears: number | null;
}

export interface JobDescriptionTalentRecommendationResult {
  candidates: JobDescriptionTalentRecommendation[];
  diagnostics: {
    vectorHitCount: number;
  };
  jobDescription: {
    id: string;
    name: string;
  };
  status: "disabled" | "ready";
}
