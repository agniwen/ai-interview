import { describe, expect, it } from "vitest";
import { constrainNextStepAction } from "../resume-evaluation-decision";
import type { ResumeScreeningResult } from "../resume-screening";

const screening = (
  recommendation: ResumeScreeningResult["recommendation"],
  overrides: Partial<ResumeScreeningResult> = {},
): ResumeScreeningResult => ({
  policyEmpty: false,
  policyEnabled: true,
  policyHash: "hash",
  policyVersion: 1,
  recommendation,
  ruleResults: [],
  ...overrides,
});

describe("constrainNextStepAction", () => {
  it("constrains interview to hold when screening recommends hold", () => {
    expect(
      constrainNextStepAction({
        action: "interview",
        screening: screening("hold"),
      }),
    ).toBe("hold");
  });

  it.each([
    ["hold", "hold", "hold"],
    ["hold", "reject", "reject"],
    ["flag", "interview", "interview"],
    ["pass", "interview", "interview"],
  ] as const)("keeps %s screening action %s unchanged", (recommendation, action, expected) => {
    expect(
      constrainNextStepAction({
        action,
        screening: screening(recommendation),
      }),
    ).toBe(expected);
  });

  it.each([screening("hold", { policyEnabled: false }), screening("hold", { policyEmpty: true })])(
    "does not constrain when the screening policy is inactive",
    (inactiveScreening) => {
      expect(
        constrainNextStepAction({
          action: "interview",
          screening: inactiveScreening,
        }),
      ).toBe("interview");
    },
  );
});
