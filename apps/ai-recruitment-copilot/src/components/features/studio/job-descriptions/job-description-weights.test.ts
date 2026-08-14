import { describe, expect, it } from "vitest";
import type { JobDescriptionDimensionWeights } from "@arc/db-schema/job-description-structured-config";
import {
  getDimensionWeightBoundaries,
  moveDimensionWeightBoundary,
} from "./job-description-weights";

const DEFAULT_WEIGHTS: JobDescriptionDimensionWeights = {
  educationBackground: 10,
  experienceRelevance: 25,
  potential: 8,
  projectMatch: 15,
  skillMatch: 35,
  stability: 7,
};

describe("job description dimension weight boundaries", () => {
  it("converts weights to five cumulative boundaries", () => {
    expect(getDimensionWeightBoundaries(DEFAULT_WEIGHTS)).toEqual([35, 60, 75, 85, 93]);
  });

  it("moves only the adjacent pair and preserves a total of 100", () => {
    const moved = moveDimensionWeightBoundary(DEFAULT_WEIGHTS, 0, 40);

    expect(moved).toEqual({
      ...DEFAULT_WEIGHTS,
      experienceRelevance: 20,
      skillMatch: 40,
    });
    expect(Object.values(moved).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it("allows a dimension to collapse to zero", () => {
    const moved = moveDimensionWeightBoundary(DEFAULT_WEIGHTS, 0, 0);

    expect(moved.skillMatch).toBe(0);
    expect(moved.experienceRelevance).toBe(60);
  });

  it("clamps a boundary to the adjacent pair", () => {
    const moved = moveDimensionWeightBoundary(DEFAULT_WEIGHTS, 2, 100);

    expect(moved.projectMatch).toBe(25);
    expect(moved.educationBackground).toBe(0);
    expect(Object.values(moved).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it("rounds pointer positions to integer weights", () => {
    const moved = moveDimensionWeightBoundary(DEFAULT_WEIGHTS, 1, 62.7);

    expect(moved.experienceRelevance).toBe(28);
    expect(moved.projectMatch).toBe(12);
  });
});
