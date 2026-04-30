import { createHash } from "node:crypto";
import { z } from "zod";

export const interviewQuestionTemplateScopeSchema = z.enum(["global", "job_description"]);
export type InterviewQuestionTemplateScope = z.infer<typeof interviewQuestionTemplateScopeSchema>;

export const interviewQuestionTemplateDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type InterviewQuestionTemplateDifficulty = z.infer<
  typeof interviewQuestionTemplateDifficultySchema
>;

export const INTERVIEW_QUESTION_DIFFICULTY_OPTIONS = [
  { label: "简单", value: "easy" },
  { label: "中等", value: "medium" },
  { label: "困难", value: "hard" },
] as const satisfies readonly { label: string; value: InterviewQuestionTemplateDifficulty }[];

export const interviewQuestionTemplateQuestionInputSchema = z.object({
  content: z.string().trim().min(1, "题目不能为空").max(1000, "题目不能超过 1000 字"),
  difficulty: interviewQuestionTemplateDifficultySchema,
  id: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0),
});

export type InterviewQuestionTemplateQuestionInput = z.infer<
  typeof interviewQuestionTemplateQuestionInputSchema
>;

export const interviewQuestionTemplateSchema = z
  .object({
    description: z.string().trim().max(1000, "描述不能超过 1000 字").optional().or(z.literal("")),
    jobDescriptionIds: z.array(z.string().trim().min(1)).max(50, "最多绑定 50 个岗位"),
    questions: z
      .array(interviewQuestionTemplateQuestionInputSchema)
      .min(1, "至少需要一道题目")
      .max(100, "最多 100 道题目"),
    scope: interviewQuestionTemplateScopeSchema,
    title: z.string().trim().min(1, "请输入模板标题").max(120, "标题不能超过 120 字"),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "job_description" && value.jobDescriptionIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请至少选择一个绑定岗位",
        path: ["jobDescriptionIds"],
      });
    }
    if (value.scope === "global" && value.jobDescriptionIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "全局模板不应绑定岗位",
        path: ["jobDescriptionIds"],
      });
    }
    const dedup = new Set(value.jobDescriptionIds);
    if (dedup.size !== value.jobDescriptionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "存在重复岗位",
        path: ["jobDescriptionIds"],
      });
    }
  });

export type InterviewQuestionTemplateInput = z.infer<typeof interviewQuestionTemplateSchema>;

export interface InterviewQuestionTemplateQuestionRecord {
  id: string;
  templateId: string;
  content: string;
  difficulty: InterviewQuestionTemplateDifficulty;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface JobDescriptionRef {
  id: string;
  name: string;
}

export interface InterviewQuestionTemplateRecord {
  id: string;
  title: string;
  description: string | null;
  scope: InterviewQuestionTemplateScope;
  jobDescriptionIds: string[];
  jobDescriptions: JobDescriptionRef[];
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  questions: InterviewQuestionTemplateQuestionRecord[];
}

export interface InterviewQuestionTemplateListRecord {
  id: string;
  title: string;
  description: string | null;
  scope: InterviewQuestionTemplateScope;
  jobDescriptionIds: string[];
  jobDescriptions: JobDescriptionRef[];
  questionCount: number;
  bindingCount: number;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface InterviewQuestionTemplateSnapshotQuestion {
  id: string;
  content: string;
  difficulty: InterviewQuestionTemplateDifficulty;
  sortOrder: number;
}

export interface InterviewQuestionTemplateSnapshot {
  templateId: string;
  title: string;
  description: string | null;
  scope: InterviewQuestionTemplateScope;
  jobDescriptionIds: string[];
  questions: InterviewQuestionTemplateSnapshotQuestion[];
}

export interface InterviewQuestionTemplateVersionRecord {
  id: string;
  templateId: string;
  version: number;
  snapshot: InterviewQuestionTemplateSnapshot;
  contentHash: string;
  createdAt: string | Date;
}

export interface InterviewQuestionTemplateBindingRecord {
  id: string;
  interviewRecordId: string;
  templateId: string;
  versionId: string;
  sortOrder: number;
  disabledByUser: boolean;
  createdAt: string | Date;
}

export function buildTemplateSnapshot(params: {
  templateId: string;
  title: string;
  description: string | null;
  scope: InterviewQuestionTemplateScope;
  jobDescriptionIds: string[];
  questions: InterviewQuestionTemplateQuestionRecord[];
}): InterviewQuestionTemplateSnapshot {
  const sortedQuestions = [...params.questions].toSorted((a, b) => a.sortOrder - b.sortOrder);
  return {
    description: params.description,
    jobDescriptionIds: [...params.jobDescriptionIds].toSorted(),
    questions: sortedQuestions.map((question) => ({
      content: question.content,
      difficulty: question.difficulty,
      id: question.id,
      sortOrder: question.sortOrder,
    })),
    scope: params.scope,
    templateId: params.templateId,
    title: params.title,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) => {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  });
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",")}}`;
}

export function hashTemplateSnapshot(snapshot: InterviewQuestionTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}
