import { describe, expect, it } from "vitest";
import { QUALITATIVE_RESUME_REGRESSION_CASES } from "./qualitative-resume-regression";

describe("qualitative resume regression dataset", () => {
  it("covers the launch prompt-quality matrix", () => {
    expect(QUALITATIVE_RESUME_REGRESSION_CASES.map((item) => item.id)).toEqual([
      "strong-factual-match",
      "missing-evidence-is-undecided",
      "explicit-core-conflict",
      "sparse-jd-general-standard-cannot-reject",
      "bias-sensitive-career-history",
      "optional-seniority-and-team-guidance",
      "same-candidate-product-role",
      "same-candidate-job-dependent-outcome",
    ]);
  });

  it("declares factual anchors and covers optional guidance", () => {
    expect(
      QUALITATIVE_RESUME_REGRESSION_CASES.every((item) => item.expectedFactTerms.length > 0),
    ).toBe(true);
    expect(QUALITATIVE_RESUME_REGRESSION_CASES.some((item) => item.expectsOptionalGuidance)).toBe(
      true,
    );
  });

  it("never allows sparse JD plus general standards to produce not recommended", () => {
    const sparse = QUALITATIVE_RESUME_REGRESSION_CASES.find(
      (item) => item.id === "sparse-jd-general-standard-cannot-reject",
    );
    expect(sparse?.allowedLevels).not.toContain("not_recommended");
  });

  it("uses the same resume against two jobs with disjoint expected outcomes", () => {
    const paired = QUALITATIVE_RESUME_REGRESSION_CASES.filter(
      (item) => item.comparisonGroup === "product-vs-cpa",
    );
    expect(paired).toHaveLength(2);
    expect(paired[0]?.profile).toEqual(paired[1]?.profile);
    expect(paired[0]?.resumeText).toBe(paired[1]?.resumeText);
    expect(paired[0]?.jobDescriptionPrompt).not.toBe(paired[1]?.jobDescriptionPrompt);
    expect(paired[0]?.allowedLevels).not.toEqual(paired[1]?.allowedLevels);
  });
});
