import { describe, expect, it } from "vitest";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { SYNTHETIC_JD_MATCH_CASES } from "./cases";

describe("synthetic JD match cases", () => {
  it("provides eight de-identified and internally consistent cases", () => {
    expect(SYNTHETIC_JD_MATCH_CASES).toHaveLength(8);
    expect(new Set(SYNTHETIC_JD_MATCH_CASES.map((item) => item.id)).size).toBe(8);

    for (const testCase of SYNTHETIC_JD_MATCH_CASES) {
      expect(resumeProfileSchema.safeParse(testCase.resumeProfile).success).toBe(true);
      expect(testCase.resumeProfile.name).toBe("合成候选人");
      expect(testCase.resumeProfile.email).toBeNull();
      expect(testCase.resumeProfile.phone).toBeNull();
      expect(testCase.candidates.length).toBeGreaterThan(1);
      expect(testCase.candidates.some((candidate) => candidate.id === testCase.expectedId)).toBe(
        true,
      );
      expect(testCase.reasonTerms.length).toBeGreaterThan(0);
    }
  });
});
