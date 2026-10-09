import { describe, expect, it } from "vitest";
import { planHumanInterviewRoundCreation } from "./human-interview-pipeline";

describe("planHumanInterviewRoundCreation", () => {
  it("reopens a completed current human-interview node without rechecking migrated screening", () => {
    expect(
      planHumanInterviewRoundCreation({
        currentStage: "second_interview",
        nodeStatus: "completed",
        roundKind: "second_interview",
        screeningResult: null,
      }),
    ).toEqual({ requiresPassedScreening: false, shouldReopenCurrentNode: true });
  });

  it("still requires a passed screening when entering human interviews from an earlier stage", () => {
    expect(
      planHumanInterviewRoundCreation({
        currentStage: "ai_interview",
        nodeStatus: "inactive",
        roundKind: "second_interview",
        screeningResult: null,
      }),
    ).toEqual({ requiresPassedScreening: true, shouldReopenCurrentNode: false });
  });
});
