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
  it("允许显式跳过复试直接进入终试", () => {
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "advance",
        expectedVersion: 2,
        reason: "直接进入终试，复试节点明确跳过",
        skipNodes: ["second_interview"],
        targetNode: "final_interview",
      }).success,
    ).toBe(true);
  });
  it("不允许跳过流水和谈薪直接进入 Offer", () => {
    expect(
      candidateTransitionInputSchema.safeParse({
        action: "advance",
        expectedVersion: 2,
        skipNodes: ["income_proof", "salary_negotiation"],
        targetNode: "offer",
      }).success,
    ).toBe(false);
  });
  it("流水审核通过或驳回必须使用专用动作并填写说明", () => {
    const base = {
      action: "review_income_proof",
      expectedVersion: 2,
      reason: "已核验近六个月流水",
    };
    expect(candidateTransitionInputSchema.safeParse({ ...base, result: "pass" }).success).toBe(
      true,
    );
    expect(candidateTransitionInputSchema.safeParse({ ...base, result: "fail" }).success).toBe(
      true,
    );
    expect(
      candidateTransitionInputSchema.safeParse({ ...base, reason: " ", result: "pass" }).success,
    ).toBe(false);
    expect(candidateTransitionInputSchema.safeParse({ ...base, result: "withdrawn" }).success).toBe(
      false,
    );
  });
  it("谈薪通过必须填写谈定月薪，淘汰时不接受薪资", () => {
    const base = {
      action: "review_salary_negotiation",
      expectedVersion: 2,
      reason: "双方已确认薪资方案",
    };
    expect(
      candidateTransitionInputSchema.safeParse({
        ...base,
        agreedBaseSalary: 28_000,
        result: "pass",
      }).success,
    ).toBe(true);
    expect(candidateTransitionInputSchema.safeParse({ ...base, result: "pass" }).success).toBe(
      false,
    );
    expect(
      candidateTransitionInputSchema.safeParse({
        ...base,
        agreedBaseSalary: 0,
        result: "pass",
      }).success,
    ).toBe(false);
    expect(candidateTransitionInputSchema.safeParse({ ...base, result: "fail" }).success).toBe(
      true,
    );
    expect(
      candidateTransitionInputSchema.safeParse({
        ...base,
        agreedBaseSalary: 28_000,
        result: "fail",
      }).success,
    ).toBe(false);
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

it("仅入职办理接受有效的到岗日期", () => {
  const input = {
    action: "update_node",
    actualJoiningDate: "2026-09-18",
    expectedVersion: 1,
    node: "onboarding",
    result: "pass",
    targetStatus: "completed",
  };
  expect(candidateTransitionInputSchema.parse(input)).toMatchObject({
    actualJoiningDate: "2026-09-18",
  });
  expect(
    candidateTransitionInputSchema.safeParse({ ...input, actualJoiningDate: "2026-02-30" }).success,
  ).toBe(false);
  expect(
    candidateTransitionInputSchema.safeParse({ ...input, node: "background_check" }).success,
  ).toBe(false);
});

it("确认入职需要到岗日期，淘汰不需要", () => {
  const input = {
    action: "update_node",
    expectedVersion: 1,
    node: "onboarding",
    result: "pass",
    targetStatus: "completed",
  };
  expect(candidateTransitionInputSchema.safeParse(input).success).toBe(false);
  expect(candidateTransitionInputSchema.safeParse({ ...input, result: "fail" }).success).toBe(true);
});
