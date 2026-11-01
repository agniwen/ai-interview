import { describe, expect, it } from "vitest";
import { recruitingPointsCalculationText } from "./recruiting-points-tooltip";

describe("recruiting points tooltip", () => {
  it("shows that each candidate is rounded before the job total is calculated", () => {
    expect(
      recruitingPointsCalculationText({
        hiredCount: 2,
        jobPriority: "high",
        jobWeight: "1.11",
        points: 3.4,
      }),
    ).toBe("1.11 × 1.5 = 1.7（单人）；1.7 × 2 人 = 3.4");
  });

  it("explains that a candidate who has not joined does not score yet", () => {
    expect(
      recruitingPointsCalculationText({
        isHired: false,
        jobPriority: "medium",
        jobWeight: "1.25",
        points: 0,
      }),
    ).toBe("尚未入职，不计分；入职后为 1.25 × 1 = 1.3");
  });
});
