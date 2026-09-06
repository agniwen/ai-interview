import { describe, expect, it } from "vitest";
import { candidateTransitionInputSchema } from "./candidate-transition";

describe("招聘动作输入", () => {
  it("筛选显式推进只允许 AI 初面或复试，且必须带版本", () => {
    for (const targetNode of ["ai_interview", "second_interview"]) {
      expect(
        candidateTransitionInputSchema.safeParse({
          action: "screening_advance",
          expectedVersion: 0,
          targetNode,
        }).success,
      ).toBe(true);
    }
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "screening_advance",
        expectedVersion: 0,
        targetNode: "final_interview",
      }).success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "screening_advance",
        targetNode: "ai_interview",
      }).success,
    ).toBe(false);
  });
  it("要求显式动作和当前版本，不接受旧宽表patch", () => {
    expect(
      candidateTransitionInputSchema.safeParse({ pipelineStage: "human_interview" }).success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({ action: "advance", targetNode: "ai_interview" })
        .success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "advance",
        expectedVersion: 2,
        targetNode: "ai_interview",
      }).success,
    ).toBe(true);
  });
  it("回开必须填写原因，并只恢复待处理状态", () => {
    const base = {
      action: "reopen",
      expectedVersion: 3,
      reason: "重新面试",
      targetNode: "second_interview",
    };
    expect(
      candidateTransitionInputSchema.safeParse({ ...base, targetStatus: "pending" }).success,
    ).toBe(true);
    expect(
      candidateTransitionInputSchema.safeParse({ ...base, targetStatus: "completed" }).success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({ ...base, reason: " ", targetStatus: "pending" })
        .success,
    ).toBe(false);
  });
  it("完成节点必须有结论，处理中不能伪造通过", () => {
    const base = { action: "update_node", expectedVersion: 1, node: "background_check" };
    expect(
      candidateTransitionInputSchema.safeParse({
        ...base,
        result: "pass",
        targetStatus: "completed",
      }).success,
    ).toBe(true);
    expect(
      candidateTransitionInputSchema.safeParse({ ...base, targetStatus: "completed" }).success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({
        ...base,
        result: "pass",
        targetStatus: "in_progress",
      }).success,
    ).toBe(false);
  });
  it("关闭须指定终局与原因码", () => {
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "close",
        closeReason: "other",
        expectedVersion: 0,
        outcome: "in_pipeline",
      }).success,
    ).toBe(false);
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "close",
        closeReason: "candidate_withdrew",
        expectedVersion: 0,
        outcome: "withdrawn",
      }).success,
    ).toBe(true);
  });
});
