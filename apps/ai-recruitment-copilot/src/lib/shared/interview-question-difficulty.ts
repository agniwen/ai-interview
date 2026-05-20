import type { InterviewQuestionTemplateDifficulty } from "@arc/db-schema/interview-question-templates";

export const DIFFICULTY_LABEL: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "简单",
  hard: "困难",
  medium: "中等",
};
