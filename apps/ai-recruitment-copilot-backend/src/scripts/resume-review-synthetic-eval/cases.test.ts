import { describe, expect, it } from "vitest";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { SYNTHETIC_RESUME_REVIEW_CASES } from "./cases";

describe("synthetic resume review cases", () => {
  it("provides six de-identified and schema-valid calibration cases", () => {
    expect(SYNTHETIC_RESUME_REVIEW_CASES).toHaveLength(6);
    expect(new Set(SYNTHETIC_RESUME_REVIEW_CASES.map((item) => item.id)).size).toBe(6);
    for (const testCase of SYNTHETIC_RESUME_REVIEW_CASES) {
      expect(resumeProfileSchema.safeParse(testCase.resumeProfile).success).toBe(true);
      expect(testCase.resumeProfile.name).toBe("合成候选人");
      expect(testCase.resumeProfile.email).toBeNull();
      expect(testCase.resumeProfile.phone).toBeNull();
      expect(testCase.expectations.allowedActions.length).toBeGreaterThan(0);
    }
  });

  it("calibrates adjacent stacks, explicit seniority gaps, and direct junior evidence", () => {
    const cases = new Map(SYNTHETIC_RESUME_REVIEW_CASES.map((testCase) => [testCase.id, testCase]));

    expect(cases.get("adjacent-frontend-stack")?.expectations).toMatchObject({
      allowedActions: ["hold"],
      dimensionBands: {
        experienceRelevance: { max: 85, min: 65 },
        projectMatch: { max: 85, min: 60 },
        skillMatch: { max: 70, min: 45 },
      },
    });
    expect(cases.get("adjacent-frontend-stack")?.resumeProfile.workExperiences).toHaveLength(1);
    expect(cases.get("strong-frontend-match")?.expectations.dimensionBands).toMatchObject({
      educationBackground: { max: 90, min: 80 },
    });
    expect(cases.get("seniority-gap")?.expectations.dimensionBands).toMatchObject({
      experienceRelevance: { max: 30, min: 0 },
      potential: { max: 40, min: 25 },
      projectMatch: { max: 25, min: 0 },
    });
    expect(cases.get("high-potential-junior")?.expectations).toMatchObject({
      allowedActions: ["interview", "hold"],
      dimensionBands: {
        experienceRelevance: { max: 75, min: 50 },
        potential: { max: 95, min: 85 },
        projectMatch: { max: 95, min: 60 },
        skillMatch: { max: 95, min: 65 },
      },
    });
    expect(cases.get("blocking-screening-hold")?.expectations).toMatchObject({
      allowedActions: ["hold"],
      dimensionBands: {
        educationBackground: { max: 25, min: 15 },
        experienceRelevance: { max: 60, min: 45 },
        potential: { max: 60, min: 45 },
        projectMatch: { max: 60, min: 45 },
        skillMatch: { max: 80, min: 65 },
        stability: { max: 60, min: 45 },
      },
    });
  });
});
