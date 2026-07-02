import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const humanRoundDaoSource = readFileSync(
  new URL("../dao/human-interview-rounds.ts", import.meta.url),
  "utf-8",
);

describe("human interview readiness guards", () => {
  it("requires feedback before human rounds can be completed or followed by a new round", () => {
    expect(routeSource).toContain('.min(1, "请填写面试评价")');
    expect(humanRoundDaoSource).toContain("HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE");
    expect(humanRoundDaoSource).toContain("assertCompletedHumanInterviewRoundsHaveFeedback");
    expect(humanRoundDaoSource).toContain("normalizeRequiredFeedback");
    expect(humanRoundDaoSource).toContain("COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE");
  });

  it("blocks offer creation and offer transition until all human interview rounds are ready", () => {
    expect(routeSource).toContain("loadHumanInterviewRoundReadiness");
    expect(routeSource).toContain("getHumanInterviewOfferReadinessError");
    expect(routeSource).toContain('existing.pipelineStage === "human_interview"');
    expect(routeSource).toContain('input.pipelineStage === "offer"');
    expect(routeSource).toContain('candidate.pipelineStage === "human_interview"');
    expect(routeSource).toContain('candidate.pipelineStage === "offer"');
    expect(routeSource).toContain("候选人已进入 Offer 阶段，不能再新建真人面试轮次。");
    expect(humanRoundDaoSource).toContain("HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE");
  });
});
