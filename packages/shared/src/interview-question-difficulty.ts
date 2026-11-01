import type { InterviewQuestionTemplateDifficulty } from "@app/db-schema/interview-question-templates";

export const DIFFICULTY_LABEL = {
  easy: "简单",
  hard: "困难",
  medium: "中等",
} satisfies Record<InterviewQuestionTemplateDifficulty, string>;

/** 难度 pill 色：编辑器选择器与只读 Badge 共用。 */
export const DIFFICULTY_PILL_CLASS = {
  easy: "bg-green-tint border border-transparent text-green-ink",
  hard: "bg-red-tint border border-transparent text-red-ink",
  medium: "bg-amber-tint border border-transparent text-amber-ink",
} satisfies Record<InterviewQuestionTemplateDifficulty, string>;
