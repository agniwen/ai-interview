import { describe, expect, it } from "vitest";
import { buildInterviewFlowSteps } from "../interview-flow-stepper";

describe("buildInterviewFlowSteps", () => {
  it("includes the form stage when the forms API returns required templates", () => {
    expect(buildInterviewFlowSteps(true).map((step) => step.id)).toEqual([
      "preparation",
      "forms",
      "interview",
    ]);
  });

  it("connects preparation directly to the interview when no forms are required", () => {
    expect(buildInterviewFlowSteps(false).map((step) => step.id)).toEqual([
      "preparation",
      "interview",
    ]);
  });
});
