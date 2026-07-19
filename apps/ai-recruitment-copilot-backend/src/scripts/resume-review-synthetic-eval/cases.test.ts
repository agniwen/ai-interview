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
});
