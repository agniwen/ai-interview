import { describe, expect, it } from "vitest";
import { getRecruitingTransitionSkipIssue } from "./recruiting-transition-skip";

describe("getRecruitingTransitionSkipIssue", () => {
  it("allows skipping only the current second-interview node when entering final interview", () => {
    expect(
      getRecruitingTransitionSkipIssue("final_interview", new Set(["second_interview"]), [
        "second_interview",
      ]),
    ).toBeNull();
  });

  it("rejects unrelated skipped nodes", () => {
    expect(
      getRecruitingTransitionSkipIssue("final_interview", new Set(["ai_interview"]), [
        "second_interview",
      ]),
    ).toBe("outside_transition");
  });

  it("rejects skipping income proof and salary negotiation into Offer", () => {
    expect(
      getRecruitingTransitionSkipIssue("offer", new Set(["income_proof", "salary_negotiation"]), [
        "final_interview",
        "income_proof",
        "salary_negotiation",
      ]),
    ).toBe("unsupported_transition");
  });
});
