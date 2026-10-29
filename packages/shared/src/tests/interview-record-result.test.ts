import { describe, expect, it } from "vitest";
import {
  aiRecommendationsForResult,
  humanConclusionsForResult,
  interviewRecordResultValues,
  resolveInterviewRecordResult,
} from "../interview-record-result";

describe("interview record result mapping", () => {
  it.each([
    ["建议进入下一轮", "pass"],
    ["待定", "pending"],
    ["不建议进入下一轮", "fail"],
  ] as const)("maps AI recommendation %s to %s", (aiRecommendation, result) => {
    expect(
      resolveInterviewRecordResult({ aiRecommendation, kind: "ai", reviewOutcome: null }),
    ).toEqual({ result, source: "ai" });
  });

  it("treats an AI round without a recommendation as unevaluated", () => {
    expect(
      resolveInterviewRecordResult({ aiRecommendation: null, kind: "ai", reviewOutcome: null }),
    ).toEqual({ result: null, source: "ai" });
  });

  it("lets a manual review override the AI recommendation", () => {
    expect(
      resolveInterviewRecordResult({
        aiRecommendation: "不建议进入下一轮",
        kind: "ai",
        reviewOutcome: "pass",
      }),
    ).toEqual({ result: "pass", source: "human" });
  });

  it.each([
    ["pass", "pass"],
    ["inconclusive", "pending"],
    ["fail", "fail"],
    ["none", null],
  ] as const)("maps human conclusion %s to %s", (conclusion, result) => {
    expect(resolveInterviewRecordResult({ conclusion, kind: "human" })).toEqual({
      result,
      source: "human",
    });
  });

  it("filters with the inverse of the display mapping", () => {
    for (const result of interviewRecordResultValues) {
      for (const aiRecommendation of aiRecommendationsForResult(result)) {
        expect(
          resolveInterviewRecordResult({ aiRecommendation, kind: "ai", reviewOutcome: null })
            .result,
        ).toBe(result);
      }
      for (const conclusion of humanConclusionsForResult(result)) {
        expect(resolveInterviewRecordResult({ conclusion, kind: "human" }).result).toBe(result);
      }
    }
    expect(aiRecommendationsForResult("pending")).toEqual(["待定"]);
    expect(humanConclusionsForResult("pending")).toEqual(["inconclusive"]);
  });
});
