import { describe, expect, it } from "vitest";
import {
  aggregateHumanInterviewOutcomes,
  combineHumanInterviewEvaluations,
} from "./human-interview-reviewer-evaluation";

describe("independent interviewer outcomes", () => {
  it.each([
    [[], "inconclusive"],
    [[null, "inconclusive"], "inconclusive"],
    [["fail", "inconclusive", null], "fail"],
    [["pass", "fail", null], "pass"],
    [["fail", "pass"], "fail"],
    [["fail", "fail"], "fail"],
  ] as const)("aggregates %j as %s", (outcomes, expected) => {
    expect(aggregateHumanInterviewOutcomes([...outcomes])).toBe(expected);
  });
  it("preserves conflicting comments with attribution", () => {
    const base = {
      detailedAnalysis: "",
      evidenceTurnIds: [],
      overallEvaluation: "",
      professionalSkill: "良",
      rating: "B" as const,
      risks: "",
      rolePosition: "",
      salaryRecommendation: "",
      seniorityPosition: "",
      strengths: "",
    };
    const result = combineHumanInterviewEvaluations([
      {
        evaluation: { ...base, overallEvaluation: "不适合", rating: "D" },
        outcome: "fail",
        reviewerName: "甲",
      },
      { evaluation: { ...base, overallEvaluation: "适合" }, outcome: "pass", reviewerName: "乙" },
    ]);
    expect(result.overallEvaluation).toContain("【甲】\n不适合");
    expect(result.overallEvaluation).toContain("【乙】\n适合");
    expect(result.rating).toBe("D");
  });
});
