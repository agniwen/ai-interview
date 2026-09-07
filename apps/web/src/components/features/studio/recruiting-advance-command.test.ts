import { describe, expect, it } from "vitest";
import { buildRecruitingAdvanceCommand } from "./recruiting-advance-command";

describe("recruiting advance commands", () => {
  it.each(["ai_interview", "second_interview"] as const)(
    "atomically approves screening before %s",
    (target) => {
      expect(
        buildRecruitingAdvanceCommand({ pipelineStage: "screening", version: 7 }, target),
      ).toEqual({ action: "screening_advance", expectedVersion: 7, targetNode: target });
    },
  );
  it("rejects unsupported screening destinations", () => {
    expect(() =>
      buildRecruitingAdvanceCommand({ pipelineStage: "screening", version: 7 }, "offer"),
    ).toThrow("请选择");
  });
  it("preserves ordinary advancement and supplied questions", () => {
    expect(
      buildRecruitingAdvanceCommand(
        { pipelineStage: "ai_interview", version: 8 },
        "second_interview",
        [],
      ),
    ).toEqual({
      action: "advance",
      expectedVersion: 8,
      interviewQuestions: [],
      targetNode: "second_interview",
    });
  });

  it("allows the second-interview stage to be skipped when entering the final interview", () => {
    expect(
      buildRecruitingAdvanceCommand(
        { pipelineStage: "second_interview", version: 9 },
        "final_interview",
      ),
    ).toEqual({
      action: "advance",
      expectedVersion: 9,
      reason: "直接进入终试，复试节点明确跳过",
      skipNodes: ["second_interview"],
      targetNode: "final_interview",
    });
  });
});
