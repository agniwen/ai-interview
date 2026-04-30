/**
 * 候选人面试前表单的内部共享类型。
 * Internal shared types for the candidate's pre-interview forms.
 */

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";

/**
 * 单题答案：单选 / 文本类题为字符串；多选题为字符串数组。
 * Single answer: string for single / text questions, string[] for multi.
 */
export type AnswerValue = string | string[];

/**
 * 必须填写的表单模板（来自服务端的 forms 接口）。
 * A required template returned by the forms endpoint.
 */
export interface RequiredTemplate {
  templateId: string;
  versionId: string;
  version: number;
  snapshot: CandidateFormTemplateSnapshot;
}

/**
 * 表单接口的整体响应。
 * Full response from the forms endpoint.
 */
export interface FormsPayload {
  required: RequiredTemplate[];
  submitted: Record<string, { versionId: string; submittedAt: string } | true>;
}

/**
 * 校验错误映射：questionId → 用户友好的提示。
 * Field-error map: questionId → user-friendly hint.
 */
export type FieldErrorMap = Record<string, string>;
