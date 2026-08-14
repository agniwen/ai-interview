import type { InterviewQuestionTemplateDifficulty } from "@arc/db-schema/interview-question-templates";

export const DIFFICULTY_LABEL: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "简单",
  hard: "困难",
  medium: "中等",
};

/** 难度 pill 色：编辑器选择器与只读 Badge 共用。 */
export const DIFFICULTY_PILL_CLASS: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  hard: "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400",
  medium: "bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400",
};
