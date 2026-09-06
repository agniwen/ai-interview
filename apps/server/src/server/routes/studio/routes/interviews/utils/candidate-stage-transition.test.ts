import { describe, expect, it, vi } from "vitest";
import { RecruitingPipelineError } from "@app/database/recruiting-pipeline";
import { transitionCandidateStage } from "./candidate-stage-transition";

const base = {
  candidateId: "record",
  operatorId: null,
  organizationId: "org",
  provenance: { kind: "manual" as const },
};
describe("招聘动作入口权限与错误映射", () => {
  it.each(["advance", "screening_advance"] as const)(
    "%s 真人权限不足时不打开事务",
    async (action) => {
      const transaction = vi.fn(() => Promise.reject(new Error("不得执行")));
      const result = await transitionCandidateStage(
        {
          ...base,
          authorize: () => Promise.resolve(false),
          input: { action, expectedVersion: 1, targetNode: "second_interview" },
        },
        { invalidateCaches: vi.fn(), transaction },
      );
      expect(result.kind).toBe("forbidden");
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it("流水和背调属于Offer权限范围", async () => {
    const authorize = vi.fn(() => Promise.resolve(false));
    const transaction = vi.fn(() => Promise.reject(new Error("不得执行")));
    await transitionCandidateStage(
      {
        ...base,
        authorize,
        input: {
          action: "update_node",
          expectedVersion: 1,
          node: "background_check",
          result: "pass",
          targetStatus: "completed",
        },
      },
      { invalidateCaches: vi.fn(), transaction },
    );
    expect(authorize).toHaveBeenCalledWith({ action: "create", resource: "offer" });
  });
  it.each(["invalid", "conflict", "not_found"] as const)("映射%s且不失效缓存", async (code) => {
    const invalidateCaches = vi.fn();
    const transaction = vi.fn(() => Promise.reject(new RecruitingPipelineError("测试错误", code)));
    const result = await transitionCandidateStage(
      {
        ...base,
        authorize: () => Promise.resolve(true),
        input: { action: "close", closeReason: "other", expectedVersion: 1, outcome: "archived" },
      },
      { invalidateCaches, transaction },
    );
    expect(result.kind).toBe(code);
    expect(invalidateCaches).not.toHaveBeenCalled();
  });
});
