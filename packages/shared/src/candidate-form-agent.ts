// 表单题编辑页实体会话（ADR-0045）的页面上下文与表单补丁契约。补丁覆盖标题、描述、适用范围、
// 绑定岗位和整份题目列表，题目沿用表单题的业务校验；绑定岗位由 Server 校验后才生成补丁。
// Page-context and form-patch contract for the candidate-form editor Subject Thread (ADR-0045).
// Patches cover the title, description, scope, job bindings and question list using the same
// question validation; the server validates job bindings before building a patch.
import { z } from "zod";
import {
  candidateFormDisplayModeSchema,
  candidateFormOptionSchema,
  candidateFormQuestionInputSchema,
  candidateFormQuestionTypeSchema,
} from "@app/db-schema/candidate-forms";
import type { CandidateFormTemplateInput } from "@app/db-schema/candidate-forms";
import type { JsonValue } from "./stable-stringify";
import {
  buildSubjectAgentBaseFingerprints,
  findSubjectAgentConflicts,
  subjectAgentValuesMatch,
} from "./subject-agent-fingerprint";
import {
  subjectAgentDisplayValuesSchema,
  subjectAgentJobBindingChangeFields,
  subjectAgentJobScopeSchema,
} from "./subject-agent-references";

export const candidateFormAgentFields = [
  "title",
  "description",
  "scope",
  "jobDescriptionIds",
  "questions",
] as const;
export type CandidateFormAgentField = (typeof candidateFormAgentFields)[number];

export const candidateFormAgentFieldLabels = {
  description: "描述",
  jobDescriptionIds: "绑定岗位",
  questions: "题目",
  scope: "作用范围",
  title: "标题",
} satisfies Record<CandidateFormAgentField, string>;

const candidateFormQuestionFields = {
  displayMode: candidateFormDisplayModeSchema,
  helperText: z.string().trim().max(500),
  label: z.string().trim().min(1).max(500),
  options: z.array(candidateFormOptionSchema).max(50),
  required: z.boolean(),
  type: candidateFormQuestionTypeSchema,
};

const agentQuestionSchema = z
  .object({
    ...candidateFormQuestionFields,
    /** 保留现有题目时沿用页面上下文中的 id；新题省略。 */
    id: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((question, context) => {
    // 与表单题保存时的题目校验一致：展示方式、选项数量与选项值唯一性。
    const result = candidateFormQuestionInputSchema.safeParse({ ...question, sortOrder: 0 });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    }
  });
export type CandidateFormAgentQuestion = z.infer<typeof agentQuestionSchema>;

/** 发送人当前未保存的表单题内容，只用于本轮推理，不持久化。 */
export const candidateFormAgentPageContextSchema = z
  .object({
    description: z.string().max(1200),
    jobDescriptionIds: z.array(z.string().max(200)).max(60),
    questions: z
      .array(z.object({ ...candidateFormQuestionFields, id: z.string().max(200) }))
      .max(60),
    scope: subjectAgentJobScopeSchema,
    title: z.string().max(200),
  })
  .strict();
export type CandidateFormAgentPageContext = z.infer<typeof candidateFormAgentPageContextSchema>;

export const candidateFormAgentPatchInputSchema = z
  .object({
    changes: z
      .object({
        description: z.string().trim().max(1000),
        ...subjectAgentJobBindingChangeFields,
        questions: z.array(agentQuestionSchema).min(1).max(50),
        title: z.string().trim().min(1).max(120),
      })
      .partial()
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, "至少需要修改一个字段"),
    summary: z.string().trim().min(1).max(300),
  })
  .strict();
export type CandidateFormAgentPatchInput = z.infer<typeof candidateFormAgentPatchInputSchema>;
export type CandidateFormAgentChanges = CandidateFormAgentPatchInput["changes"];

export const candidateFormAgentPatchSchema = candidateFormAgentPatchInputSchema.extend({
  baseFingerprints: z.record(z.string(), z.string()),
  displayValues: subjectAgentDisplayValuesSchema.optional(),
  kind: z.literal("candidate_form_patch"),
});
export type CandidateFormAgentPatch = z.infer<typeof candidateFormAgentPatchSchema>;

function changedFields(changes: CandidateFormAgentChanges): CandidateFormAgentField[] {
  return candidateFormAgentFields.filter((field) => changes[field] !== undefined);
}

export function pickCandidateFormAgentPageContext(
  values: CandidateFormTemplateInput,
): CandidateFormAgentPageContext {
  return {
    description: values.description ?? "",
    jobDescriptionIds: [...values.jobDescriptionIds],
    questions: values.questions.map((question) => ({
      displayMode: question.displayMode,
      helperText: question.helperText ?? "",
      id: question.id ?? "",
      label: question.label,
      options: question.options.map((option) => ({ ...option })),
      required: question.required,
      type: question.type,
    })),
    scope: values.scope,
    title: values.title,
  };
}

export function buildCandidateFormAgentPatch(
  input: CandidateFormAgentPatchInput,
  pageContext: CandidateFormAgentPageContext | null,
  displayValues: Record<string, string> = {},
): CandidateFormAgentPatch {
  const baseFingerprints = pageContext
    ? buildSubjectAgentBaseFingerprints(changedFields(input.changes), (field) => pageContext[field])
    : {};
  return { ...input, baseFingerprints, displayValues, kind: "candidate_form_patch" };
}

export function findCandidateFormAgentPatchConflicts(
  patch: CandidateFormAgentPatch,
  current: CandidateFormAgentPageContext,
): CandidateFormAgentField[] {
  return findSubjectAgentConflicts(
    changedFields(patch.changes),
    patch.baseFingerprints,
    (field) => current[field],
  );
}

/** 为补丁题目确定 id：沿用页面中存在的 id，其余由 createId 生成；结果与页面上下文同构，便于撤销。 */
export function resolveCandidateFormAgentQuestions(
  questions: CandidateFormAgentQuestion[],
  current: CandidateFormAgentPageContext,
  createId: () => string,
): CandidateFormAgentPageContext["questions"] {
  const existingIds = new Set(current.questions.map((question) => question.id));
  return questions.map((question) => ({
    displayMode: question.displayMode,
    helperText: question.helperText,
    id: question.id && existingIds.has(question.id) ? question.id : createId(),
    label: question.label,
    options: question.type === "text" ? [] : question.options.map((option) => ({ ...option })),
    required: question.required,
    type: question.type,
  }));
}

/** 页面上下文中的题目写回表单：排序按数组顺序。 */
export function toCandidateFormQuestions(
  questions: CandidateFormAgentPageContext["questions"],
): CandidateFormTemplateInput["questions"] {
  return questions.map((question, index) => ({
    displayMode: question.displayMode,
    helperText: question.helperText,
    id: question.id,
    label: question.label,
    options: question.options.map((option) => ({ ...option })),
    required: question.required,
    sortOrder: index,
    type: question.type,
  }));
}

/** 比较题目时忽略 id（新题应用时才分配）；填写题不带选项。 */
function comparableQuestions(
  questions: readonly Omit<CandidateFormAgentQuestion, "id">[],
): JsonValue {
  return questions.map((question) => ({
    displayMode: question.displayMode,
    helperText: question.helperText.trim(),
    label: question.label.trim(),
    options:
      question.type === "text"
        ? []
        : question.options.map((option) => ({ label: option.label, value: option.value })),
    required: question.required,
    type: question.type,
  }));
}

function comparableValue(
  values: CandidateFormAgentChanges | CandidateFormAgentPageContext,
  field: CandidateFormAgentField,
): JsonValue {
  if (field === "questions") {
    return values.questions ? comparableQuestions(values.questions) : null;
  }
  return values[field] ?? null;
}

/** 补丁修改的字段在给定表单内容中是否都已是补丁的值。 */
export function candidateFormAgentPatchMatches(
  patch: CandidateFormAgentPatch,
  values: CandidateFormAgentPageContext,
): boolean {
  return subjectAgentValuesMatch(
    changedFields(patch.changes),
    (field) => comparableValue(patch.changes, field),
    (field) => comparableValue(values, field),
  );
}
