import { describe, expect, it } from "vitest";
import {
  HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
  HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE,
  getHumanInterviewOfferReadinessError,
  humanInterviewFeedbackSchema,
} from "./human-interview-readiness";

describe("humanInterviewFeedbackSchema", () => {
  it("rejects missing and blank feedback", () => {
    const missingFeedback: unknown = undefined;
    expect(humanInterviewFeedbackSchema.safeParse(missingFeedback).success).toBe(false);
    const blank = humanInterviewFeedbackSchema.safeParse("   ");
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toBe(HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE);
  });

  it("normalizes meaningful feedback", () => {
    expect(humanInterviewFeedbackSchema.parse("  沟通清晰，经验匹配  ")).toBe("沟通清晰，经验匹配");
  });
});

describe("getHumanInterviewOfferReadinessError", () => {
  it.each([
    {
      completedRoundsMissingFeedback: 0,
      pendingRounds: 0,
      totalRounds: 0,
    },
    {
      completedRoundsMissingFeedback: 0,
      pendingRounds: 1,
      totalRounds: 2,
    },
    {
      completedRoundsMissingFeedback: 1,
      pendingRounds: 0,
      totalRounds: 2,
    },
  ])("blocks an offer when readiness is %o", (readiness) => {
    expect(getHumanInterviewOfferReadinessError(readiness)).toBe(
      HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE,
    );
  });

  it("rejects completed rounds without effective passed conclusions", () => {
    expect(
      getHumanInterviewOfferReadinessError({
        completedRoundsMissingFeedback: 0,
        finalInterviewPassed: false,
        pendingRounds: 0,
        secondInterviewPassed: true,
        totalRounds: 2,
      }),
    ).toBe(HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE);
  });

  it("allows income proof only when both effective human rounds passed with feedback", () => {
    expect(
      getHumanInterviewOfferReadinessError({
        completedRoundsMissingFeedback: 0,
        finalInterviewPassed: true,
        pendingRounds: 0,
        secondInterviewPassed: true,
        totalRounds: 2,
      }),
    ).toBeNull();
  });
});
