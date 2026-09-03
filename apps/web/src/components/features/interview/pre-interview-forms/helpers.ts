/**
 * 候选人前置表单的纯函数工具。
 * Pure helpers for the candidate pre-interview forms.
 */

import type { CandidateFormTemplateSnapshot } from "@app/db-schema/candidate-forms";
import { buildCandidateFormAnswersSchema } from "@app/db-schema/candidate-forms";
import { z } from "zod";
import type { AnswerMap, FieldErrorMap } from "./types";

/**
 * 根据题目类型预填初始答案：单选 / 文本 → 空串，多选 → 空数组。
 * Build the initial answer map: single / text → empty string, multi → empty array.
 */
export function buildInitialAnswers(snapshot: CandidateFormTemplateSnapshot): AnswerMap {
  const answers: AnswerMap = {};
  for (const question of snapshot.questions) {
    answers[question.id] = question.type === "multi" ? [] : "";
  }
  return answers;
}

/**
 * 把 Zod 抛出的"硬错误信息"转成候选人能看懂的提示。
 * Translate raw zod error messages into candidate-friendly hints.
 */
export function friendlyMessage(raw: string): string {
  // Surface the most common required-field complaints in candidate-friendly
  // wording; unknown messages fall through unchanged.
  // 把最常见的必填校验文案换成候选人友好版本，未识别的原文透传。
  if (raw.includes("不在可选项")) {
    return "请选择一项";
  }
  if (raw.includes("至少选择")) {
    return "请至少选择一项";
  }
  if (raw.includes("不能为空")) {
    return "请填写本题";
  }
  return raw;
}

/**
 * 跑服务端使用的 Zod schema，再把错误按 questionId 聚合，便于 UI 高亮对应字段。
 * Run the same zod schema the server uses, then group issues by questionId so the
 * offending Field can be highlighted in place.
 */
export function validateAnswers(
  snapshot: CandidateFormTemplateSnapshot,
  answers: AnswerMap,
): FieldErrorMap {
  const schema = buildCandidateFormAnswersSchema(snapshot);
  const normalized: AnswerMap = {};
  for (const question of snapshot.questions) {
    const raw = answers[question.id];
    if (question.type === "multi") {
      normalized[question.id] = Array.isArray(raw) ? raw : [];
    } else {
      normalized[question.id] = Array.isArray(raw) ? "" : raw;
    }
  }

  const result = schema.safeParse(normalized);
  if (result.success) {
    return {};
  }

  const errors: FieldErrorMap = {};
  for (const issue of result.error.issues) {
    const questionId = z.string().safeParse(issue.path[0]);
    if (!questionId.success || errors[questionId.data]) {
      continue;
    }
    errors[questionId.data] = friendlyMessage(issue.message);
  }
  return errors;
}
