import type { InterviewQuestionOutcome } from "@app/shared/interview/question-outcomes";

export type InterviewQuestionStatus = InterviewQuestionOutcome["status"];

export const QUESTION_STATUS_LABELS = {
  answered: "已回答",
  in_progress: "收集中",
  insufficient: "信息不足",
  interrupted: "已中断",
  skipped: "已跳过",
  unasked: "未提问",
} satisfies Record<InterviewQuestionStatus, string>;

// 状态语义色：答完为绿，信息不足为琥珀，中断为橙，跳过为红，收集中为蓝，未提问保持中性。
// Semantic tones: answered green, insufficient amber, interrupted orange, skipped red,
// in progress blue, unasked neutral.
export const QUESTION_STATUS_VARIANTS = {
  answered: "success",
  in_progress: "info",
  insufficient: "warning",
  interrupted: "orange",
  skipped: "danger",
  unasked: "outline",
} as const satisfies Record<InterviewQuestionStatus, string>;

export const QUESTION_END_REASON_LABELS = {
  candidate_ended_round: "候选人结束整轮",
  question_prompt_interrupted: "题目播报被打断",
  reconnect_grace_expired: "重连宽限期耗尽",
  system_shutdown: "系统终止",
  time_limit: "时间截止",
} as const satisfies Record<NonNullable<InterviewQuestionOutcome["reason"]>, string>;
