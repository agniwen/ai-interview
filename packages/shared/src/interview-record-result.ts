// 面试管理列表的统一“面试结果”：真人结论与 AI 建议都归到 通过 / 待定 / 不通过 三值，
// 展示与服务端筛选共用同一份映射。
// Unified interview result for the interview management list: human conclusions and AI
// recommendations both map to pass / pending / fail; display and server filtering share it.

export const interviewRecordResultValues = ["pass", "pending", "fail"] as const;
export type InterviewRecordResult = (typeof interviewRecordResultValues)[number];

export const interviewRecordResultLabels = {
  fail: "不通过",
  pass: "通过",
  pending: "待定",
} as const satisfies Record<InterviewRecordResult, string>;

/**
 * AI 面试报告给出的建议，也是报告生成结构化输出的枚举（顺序保持不变）。
 * / AI interview report recommendations; also the report generator's output enum (order kept).
 */
export const aiInterviewRecommendationValues = [
  "建议进入下一轮",
  "不建议进入下一轮",
  "待定",
] as const;
export type AiInterviewRecommendation = (typeof aiInterviewRecommendationValues)[number];

const AI_RECOMMENDATION_RESULT = {
  不建议进入下一轮: "fail",
  建议进入下一轮: "pass",
  待定: "pending",
} as const satisfies Record<AiInterviewRecommendation, InterviewRecordResult>;

/** 真人轮次结论（含 AI 轮次的人工复核）。/ Human round conclusion, also used for AI manual review. */
export type HumanInterviewConclusion = "pass" | "fail" | "inconclusive" | "none";

const HUMAN_CONCLUSION_RESULT = {
  fail: "fail",
  inconclusive: "pending",
  none: null,
  pass: "pass",
} as const satisfies Record<HumanInterviewConclusion, InterviewRecordResult | null>;

export function isAiInterviewRecommendation(value: unknown): value is AiInterviewRecommendation {
  return aiInterviewRecommendationValues.some((item) => item === value);
}

export function isInterviewRecordResult(value: unknown): value is InterviewRecordResult {
  return interviewRecordResultValues.some((item) => item === value);
}

export function aiRecommendationToResult(
  recommendation: AiInterviewRecommendation | null,
): InterviewRecordResult | null {
  return recommendation ? AI_RECOMMENDATION_RESULT[recommendation] : null;
}

export function humanConclusionToResult(
  conclusion: HumanInterviewConclusion,
): InterviewRecordResult | null {
  return HUMAN_CONCLUSION_RESULT[conclusion];
}

/** 筛选用的反向映射：哪些 AI 建议归到该结果。/ AI recommendations that map to a result. */
export function aiRecommendationsForResult(
  result: InterviewRecordResult,
): AiInterviewRecommendation[] {
  return aiInterviewRecommendationValues.filter(
    (item) => AI_RECOMMENDATION_RESULT[item] === result,
  );
}

/** 筛选用的反向映射：哪些真人结论归到该结果。/ Human conclusions that map to a result. */
export function humanConclusionsForResult(
  result: InterviewRecordResult,
): Exclude<HumanInterviewConclusion, "none">[] {
  return (["pass", "inconclusive", "fail"] as const).filter(
    (item) => HUMAN_CONCLUSION_RESULT[item] === result,
  );
}

export type InterviewRecordResultSource = "ai" | "human";

/** 列表行的统一结果；result 为 null 表示未评价。/ Unified row result; null means unevaluated. */
export interface ResolvedInterviewRecordResult {
  result: InterviewRecordResult | null;
  source: InterviewRecordResultSource;
}

/**
 * 列表行的统一结果与来源。真人轮次取真人结论；AI 轮次以人工复核为准，未复核时取 AI 建议。
 * 没有结论时 result 为 null（未评价）。
 * / Unified result and its source. Human rounds use the human conclusion; AI rounds prefer
 * the manual review and fall back to the AI recommendation. A null result means unevaluated.
 */
export function resolveInterviewRecordResult(
  record:
    | { kind: "human"; conclusion: HumanInterviewConclusion }
    | {
        kind: "ai";
        aiRecommendation: AiInterviewRecommendation | null;
        reviewOutcome: "pass" | "fail" | null;
      },
): ResolvedInterviewRecordResult {
  if (record.kind === "human") {
    return { result: humanConclusionToResult(record.conclusion), source: "human" };
  }
  if (record.reviewOutcome) {
    return { result: humanConclusionToResult(record.reviewOutcome), source: "human" };
  }
  return { result: aiRecommendationToResult(record.aiRecommendation), source: "ai" };
}
