import { z } from "zod";

export const HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE = "请填写面试评价";
export const COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE =
  "请先填写已完成真人面试轮次的面试评价。";
export const HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE =
  "请先完成所有真人面试轮次，并补全每轮面试评价。";

export interface HumanInterviewRoundReadiness {
  completedRoundsMissingFeedback: number;
  pendingRounds: number;
  totalRounds: number;
}

export const humanInterviewFeedbackSchema = z
  .string()
  .trim()
  .min(1, HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE)
  .max(5000);

export function getHumanInterviewOfferReadinessError(
  readiness: HumanInterviewRoundReadiness,
): string | null {
  return readiness.totalRounds > 0 &&
    readiness.pendingRounds === 0 &&
    readiness.completedRoundsMissingFeedback === 0
    ? null
    : HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE;
}
