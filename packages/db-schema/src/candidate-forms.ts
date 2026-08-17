import { z } from "zod";

export const candidateFormScopeSchema = z.enum(["global", "job_description"]);
export type CandidateFormScope = z.infer<typeof candidateFormScopeSchema>;

export const candidateFormQuestionTypeSchema = z.enum(["single", "multi", "text"]);
export type CandidateFormQuestionType = z.infer<typeof candidateFormQuestionTypeSchema>;

export const candidateFormDisplayModeSchema = z.enum([
  "radio",
  "checkbox",
  "select",
  "input",
  "textarea",
]);
export type CandidateFormDisplayMode = z.infer<typeof candidateFormDisplayModeSchema>;

export const DISPLAY_MODES_BY_TYPE = {
  multi: ["checkbox", "select"],
  single: ["radio", "select"],
  text: ["input", "textarea"],
} as const satisfies Record<CandidateFormQuestionType, readonly CandidateFormDisplayMode[]>;

export const DEFAULT_DISPLAY_MODE = {
  multi: "checkbox",
  single: "select",
  text: "textarea",
} satisfies Record<CandidateFormQuestionType, CandidateFormDisplayMode>;

export function isDisplayModeAllowed(
  type: CandidateFormQuestionType,
  displayMode: CandidateFormDisplayMode,
): boolean {
  return DISPLAY_MODES_BY_TYPE[type].some((allowedMode) => allowedMode === displayMode);
}

export const candidateFormOptionSchema = z.object({
  label: z.string().trim().min(1, "选项文本不能为空").max(200, "选项文本不能超过 200 字"),
  value: z.string().trim().min(1, "选项值不能为空").max(200, "选项值不能超过 200 字"),
});
export type CandidateFormOption = z.infer<typeof candidateFormOptionSchema>;

export const candidateFormQuestionInputSchema = z
  .object({
    displayMode: candidateFormDisplayModeSchema,
    helperText: z.string().trim().max(500, "提示文字不能超过 500 字").optional().or(z.literal("")),
    id: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1, "题目不能为空").max(500, "题目不能超过 500 字"),
    options: z.array(candidateFormOptionSchema).max(50, "单题选项最多 50 个"),
    required: z.boolean(),
    sortOrder: z.number().int().min(0),
    type: candidateFormQuestionTypeSchema,
  })
  .superRefine((value, ctx) => {
    if (!isDisplayModeAllowed(value.type, value.displayMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `题目类型 ${value.type} 不支持 ${value.displayMode} 展示方式`,
        path: ["displayMode"],
      });
    }
    if (value.type === "text") {
      if (value.options.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "填写题不应配置选项",
          path: ["options"],
        });
      }
      return;
    }
    if (value.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "至少需要 2 个选项",
        path: ["options"],
      });
      return;
    }
    const seenValues = new Set<string>();
    for (let index = 0; index < value.options.length; index += 1) {
      const option = value.options[index];
      if (!option) {
        continue;
      }
      if (seenValues.has(option.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "选项值不能重复",
          path: ["options", index, "value"],
        });
      }
      seenValues.add(option.value);
    }
  });

export type CandidateFormQuestionInput = z.infer<typeof candidateFormQuestionInputSchema>;

export const candidateFormTemplateSchema = z
  .object({
    description: z.string().trim().max(1000, "描述不能超过 1000 字").optional().or(z.literal("")),
    jobDescriptionIds: z.array(z.string().trim().min(1)).max(50, "最多绑定 50 个岗位"),
    questions: z
      .array(candidateFormQuestionInputSchema)
      .min(1, "至少需要一道题目")
      .max(50, "最多 50 道题目"),
    scope: candidateFormScopeSchema,
    title: z.string().trim().min(1, "请输入面试表单标题").max(120, "标题不能超过 120 字"),
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
        message: "全局模版不应绑定岗位",
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

export type CandidateFormTemplateInput = z.infer<typeof candidateFormTemplateSchema>;

export interface CandidateFormTemplateQuestionRecord {
  id: string;
  templateId: string;
  type: CandidateFormQuestionType;
  displayMode: CandidateFormDisplayMode;
  label: string;
  helperText: string | null;
  required: boolean;
  sortOrder: number;
  options: CandidateFormOption[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface JobDescriptionRef {
  id: string;
  name: string;
}

export interface CandidateFormTemplateRecord {
  id: string;
  title: string;
  description: string | null;
  scope: CandidateFormScope;
  jobDescriptionIds: string[];
  jobDescriptions: JobDescriptionRef[];
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  archivedAt: string | Date | null;
  questions: CandidateFormTemplateQuestionRecord[];
}

export interface CandidateFormTemplateListRecord {
  id: string;
  title: string;
  description: string | null;
  scope: CandidateFormScope;
  jobDescriptionIds: string[];
  jobDescriptions: JobDescriptionRef[];
  questionCount: number;
  submissionCount: number;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  archivedAt: string | Date | null;
}

export interface CandidateFormTemplateSnapshotQuestion {
  id: string;
  type: CandidateFormQuestionType;
  displayMode: CandidateFormDisplayMode;
  label: string;
  helperText: string | null;
  required: boolean;
  sortOrder: number;
  options: CandidateFormOption[];
}

export interface CandidateFormTemplateSnapshot {
  templateId: string;
  title: string;
  description: string | null;
  scope: CandidateFormScope;
  jobDescriptionIds: string[];
  questions: CandidateFormTemplateSnapshotQuestion[];
}

export interface CandidateFormTemplateVersionRecord {
  id: string;
  templateId: string;
  version: number;
  snapshot: CandidateFormTemplateSnapshot;
  contentHash: string;
  createdAt: string | Date;
}

export interface CandidateFormSubmissionRecord {
  id: string;
  templateId: string;
  versionId: string;
  version: number;
  interviewRecordId: string;
  answers: Record<string, string | string[]>;
  submittedAt: string | Date;
}

export interface CandidateFormSubmissionWithSnapshot extends CandidateFormSubmissionRecord {
  snapshot: CandidateFormTemplateSnapshot;
}

export function buildTemplateSnapshot(params: {
  templateId: string;
  title: string;
  description: string | null;
  scope: CandidateFormScope;
  jobDescriptionIds: string[];
  questions: CandidateFormTemplateQuestionRecord[];
}): CandidateFormTemplateSnapshot {
  const sortedQuestions = [...params.questions].toSorted((a, b) => a.sortOrder - b.sortOrder);
  return {
    description: params.description,
    jobDescriptionIds: [...params.jobDescriptionIds].toSorted(),
    questions: sortedQuestions.map((question) => ({
      displayMode: question.displayMode,
      helperText: question.helperText,
      id: question.id,
      label: question.label,
      options: question.options.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      required: question.required,
      sortOrder: question.sortOrder,
      type: question.type,
    })),
    scope: params.scope,
    templateId: params.templateId,
    title: params.title,
  };
}

/**
 * Build a Zod schema that validates an answers payload against a specific
 * snapshot. Returns `{ [questionId]: string | string[] }`, rejecting
 * required-but-empty and unknown question ids.
 */
export function buildCandidateFormAnswersSchema(
  snapshot: CandidateFormTemplateSnapshot,
): z.ZodType<Record<string, string | string[]>> {
  const questionsById = new Map(snapshot.questions.map((question) => [question.id, question]));

  return z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .superRefine((answers, ctx) => {
      for (const answerId of Object.keys(answers)) {
        if (!questionsById.has(answerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.unrecognized_keys,
            keys: [answerId],
          });
        }
      }

      for (const question of snapshot.questions) {
        const answer = answers[question.id];
        const path = [question.id];
        if (question.type === "multi") {
          if (!Array.isArray(answer)) {
            if (question.required || answer !== undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案格式无效", path });
            }
            continue;
          }
          if (question.required && answer.length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请至少选择一项", path });
          }
          const allowedValues = new Set(question.options.map((option) => option.value));
          if (!answer.every((value) => allowedValues.has(value))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案包含无效选项", path });
          }
          continue;
        }

        const parsedAnswer = z.string().safeParse(answer);
        if (!parsedAnswer.success) {
          if (question.required || answer !== undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案格式无效", path });
          }
          continue;
        }
        const stringAnswer = parsedAnswer.data;
        if (question.required && stringAnswer.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案不能为空", path });
        }
        if (question.type === "text") {
          if (stringAnswer.length > 5000) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案不能超过 5000 字", path });
          }
          continue;
        }
        const allowedValues = new Set(question.options.map((option) => option.value));
        if (stringAnswer.length > 0 && !allowedValues.has(stringAnswer)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "答案不在可选项范围内", path });
        }
      }
    });
}
