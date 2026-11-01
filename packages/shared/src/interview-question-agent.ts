// 沟通题编辑页实体会话（ADR-0045）的页面上下文与表单补丁契约。补丁覆盖标题、描述、适用范围、
// 绑定岗位和整份题目列表；绑定岗位由 Server 校验后才生成补丁。
// Page-context and form-patch contract for the interview-question editor Subject Thread
// (ADR-0045). Patches cover the title, description, scope, job bindings and the whole question
// list; the server validates job bindings before building a patch.
import { z } from "zod";
import { interviewQuestionTemplateDifficultySchema } from "@app/db-schema/interview-question-templates";
import type { InterviewQuestionTemplateInput } from "@app/db-schema/interview-question-templates";
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

export const interviewQuestionAgentFields = [
  "title",
  "description",
  "scope",
  "jobDescriptionIds",
  "questions",
] as const;
export type InterviewQuestionAgentField = (typeof interviewQuestionAgentFields)[number];

export const interviewQuestionAgentFieldLabels = {
  description: "描述",
  jobDescriptionIds: "绑定岗位",
  questions: "题目",
  scope: "作用范围",
  title: "标题",
} satisfies Record<InterviewQuestionAgentField, string>;

const agentQuestionSchema = z
  .object({
    content: z.string().trim().min(1).max(1000),
    difficulty: interviewQuestionTemplateDifficultySchema,
    evaluationFocus: z.string().trim().max(500).nullable(),
    followUpDirections: z.string().trim().max(1000).nullable(),
    /** 保留现有题目时沿用页面上下文中的 id；新题省略。 */
    id: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type InterviewQuestionAgentQuestion = z.infer<typeof agentQuestionSchema>;

/** 发送人当前未保存的沟通题表单内容，只用于本轮推理，不持久化。 */
export const interviewQuestionAgentPageContextSchema = z
  .object({
    description: z.string().max(1200),
    jobDescriptionIds: z.array(z.string().max(200)).max(60),
    questions: z
      .array(
        z.object({
          content: z.string().max(1200),
          difficulty: interviewQuestionTemplateDifficultySchema,
          evaluationFocus: z.string().max(600).nullable(),
          followUpDirections: z.string().max(1200).nullable(),
          id: z.string().max(200),
        }),
      )
      .max(120),
    scope: subjectAgentJobScopeSchema,
    title: z.string().max(200),
  })
  .strict();
export type InterviewQuestionAgentPageContext = z.infer<
  typeof interviewQuestionAgentPageContextSchema
>;

export const interviewQuestionAgentPatchInputSchema = z
  .object({
    changes: z
      .object({
        description: z.string().trim().max(1000),
        ...subjectAgentJobBindingChangeFields,
        questions: z.array(agentQuestionSchema).min(1).max(100),
        title: z.string().trim().min(1).max(120),
      })
      .partial()
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, "至少需要修改一个字段"),
    summary: z.string().trim().min(1).max(300),
  })
  .strict();
export type InterviewQuestionAgentPatchInput = z.infer<
  typeof interviewQuestionAgentPatchInputSchema
>;
export type InterviewQuestionAgentChanges = InterviewQuestionAgentPatchInput["changes"];

export const interviewQuestionAgentPatchSchema = interviewQuestionAgentPatchInputSchema.extend({
  baseFingerprints: z.record(z.string(), z.string()),
  displayValues: subjectAgentDisplayValuesSchema.optional(),
  kind: z.literal("interview_question_patch"),
});
export type InterviewQuestionAgentPatch = z.infer<typeof interviewQuestionAgentPatchSchema>;

function changedFields(changes: InterviewQuestionAgentChanges): InterviewQuestionAgentField[] {
  return interviewQuestionAgentFields.filter((field) => changes[field] !== undefined);
}

export function pickInterviewQuestionAgentPageContext(
  values: InterviewQuestionTemplateInput,
): InterviewQuestionAgentPageContext {
  return {
    description: values.description ?? "",
    jobDescriptionIds: [...values.jobDescriptionIds],
    questions: values.questions.map((question) => ({
      content: question.content,
      difficulty: question.difficulty,
      evaluationFocus: question.evaluationFocus ?? null,
      followUpDirections: question.followUpDirections ?? null,
      id: question.id ?? "",
    })),
    scope: values.scope,
    title: values.title,
  };
}

export function buildInterviewQuestionAgentPatch(
  input: InterviewQuestionAgentPatchInput,
  pageContext: InterviewQuestionAgentPageContext | null,
  displayValues: Record<string, string> = {},
): InterviewQuestionAgentPatch {
  const baseFingerprints = pageContext
    ? buildSubjectAgentBaseFingerprints(changedFields(input.changes), (field) => pageContext[field])
    : {};
  return { ...input, baseFingerprints, displayValues, kind: "interview_question_patch" };
}

export function findInterviewQuestionAgentPatchConflicts(
  patch: InterviewQuestionAgentPatch,
  current: InterviewQuestionAgentPageContext,
): InterviewQuestionAgentField[] {
  return findSubjectAgentConflicts(
    changedFields(patch.changes),
    patch.baseFingerprints,
    (field) => current[field],
  );
}

/**
 * 为补丁题目确定 id：沿用页面中存在的 id，其余由 createId 生成；结果与页面上下文同构，便于撤销。
 * Resolves ids for patch questions, keeping ids present on the page.
 */
export function resolveInterviewQuestionAgentQuestions(
  questions: InterviewQuestionAgentQuestion[],
  current: InterviewQuestionAgentPageContext,
  createId: () => string,
): InterviewQuestionAgentPageContext["questions"] {
  const existingIds = new Set(current.questions.map((question) => question.id));
  return questions.map((question) => ({
    content: question.content,
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus,
    followUpDirections: question.followUpDirections,
    id: question.id && existingIds.has(question.id) ? question.id : createId(),
  }));
}

/** 页面上下文中的题目写回表单：排序按数组顺序。 */
export function toInterviewQuestionFormQuestions(
  questions: InterviewQuestionAgentPageContext["questions"],
): InterviewQuestionTemplateInput["questions"] {
  return questions.map((question, index) => ({
    content: question.content,
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus ?? "",
    followUpDirections: question.followUpDirections ?? "",
    id: question.id,
    sortOrder: index,
  }));
}

/** 比较题目时忽略 id（新题应用时才分配），可空文本的空白与 null 视为相同。 */
function comparableQuestions(
  questions: readonly Omit<InterviewQuestionAgentQuestion, "id">[],
): JsonValue {
  return questions.map((question) => ({
    content: question.content.trim(),
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
  }));
}

function comparableValue(
  values: InterviewQuestionAgentChanges | InterviewQuestionAgentPageContext,
  field: InterviewQuestionAgentField,
): JsonValue {
  if (field === "questions") {
    return values.questions ? comparableQuestions(values.questions) : null;
  }
  return values[field] ?? null;
}

/** 补丁修改的字段在给定表单内容中是否都已是补丁的值。 */
export function interviewQuestionAgentPatchMatches(
  patch: InterviewQuestionAgentPatch,
  values: InterviewQuestionAgentPageContext,
): boolean {
  return subjectAgentValuesMatch(
    changedFields(patch.changes),
    (field) => comparableValue(patch.changes, field),
    (field) => comparableValue(values, field),
  );
}
