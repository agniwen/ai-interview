import { describe, expect, it, vi } from "vitest";
import { RecruitingPipelineError } from "@app/database/recruiting-pipeline";
import {
  reviewIncomeProofAndAdvanceTx,
  reviewSalaryNegotiationAndAdvanceTx,
  transitionCandidateStage,
} from "./candidate-stage-transition";

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
  it("流水审核通过与进入谈薪在同一事务内连续完成", async () => {
    const tx = {};
    const updateNode = vi.fn().mockResolvedValue({
      changed: true,
      currentStage: "income_proof",
      outcome: "in_pipeline",
      version: 2,
    });
    const advanceNode = vi.fn().mockResolvedValue({
      changed: true,
      currentStage: "salary_negotiation",
      outcome: "in_pipeline",
      version: 3,
    });
    // SAFETY: 测试通过注入的操作函数隔离事务实现，伪事务对象不会被直接访问。
    const result = await reviewIncomeProofAndAdvanceTx(
      tx as never,
      {
        expectedVersion: 1,
        operatorId: null,
        organizationId: "org",
        recordId: "record",
      },
      {
        action: "review_income_proof",
        expectedVersion: 1,
        reason: "流水真实有效",
        result: "pass",
      },
      { advanceNode, updateNode },
    );

    expect(updateNode).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        expectedVersion: 1,
        node: "income_proof",
        reason: "流水真实有效",
        result: "pass",
        status: "completed",
      }),
    );
    expect(advanceNode).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        expectedVersion: 2,
        targetNode: "salary_negotiation",
      }),
    );
    expect(result).toMatchObject({ currentStage: "salary_negotiation", version: 3 });
  });
  it("谈薪通过时保存谈定月薪并在同一事务进入发 Offer", async () => {
    const tx = {};
    const updateExpectations = vi.fn().mockResolvedValue({
      next: { agreedBaseSalary: 28_000 },
      previous: { agreedBaseSalary: 26_000 },
    });
    const recordAudit = vi.fn(() => Promise.resolve());
    const updateNode = vi.fn().mockResolvedValue({
      changed: true,
      currentStage: "salary_negotiation",
      outcome: "in_pipeline",
      version: 2,
    });
    const advanceNode = vi.fn().mockResolvedValue({
      changed: true,
      currentStage: "offer",
      outcome: "in_pipeline",
      version: 3,
    });
    // SAFETY: 测试通过注入的操作函数隔离事务实现，伪事务对象不会被直接访问。
    const result = await reviewSalaryNegotiationAndAdvanceTx(
      tx as never,
      {
        expectedVersion: 1,
        operatorId: null,
        organizationId: "org",
        recordId: "record",
      },
      {
        action: "review_salary_negotiation",
        agreedBaseSalary: 28_000,
        expectedVersion: 1,
        reason: "双方已确认薪资方案",
        result: "pass",
      },
      { advanceNode, recordAudit, updateExpectations, updateNode },
    );

    expect(updateExpectations).toHaveBeenCalledWith(tx, "record", "org", {
      agreedBaseSalary: 28_000,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ operatorId: null, organizationId: "org", recordId: "record" }),
      { agreedBaseSalary: 28_000, previousAgreedBaseSalary: 26_000 },
    );
    expect(updateNode).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        node: "salary_negotiation",
        reason: "双方已确认薪资方案",
        result: "pass",
        status: "completed",
      }),
    );
    expect(advanceNode).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ expectedVersion: 2, targetNode: "offer" }),
    );
    expect(result).toMatchObject({ currentStage: "offer", version: 3 });
  });
  it("谈薪淘汰时不保存薪资或推进阶段", async () => {
    const tx = {};
    const updateExpectations = vi.fn();
    const recordAudit = vi.fn();
    const advanceNode = vi.fn();
    const updateNode = vi.fn().mockResolvedValue({
      changed: true,
      currentStage: "closed",
      outcome: "rejected",
      version: 2,
    });
    // SAFETY: 测试通过注入的操作函数隔离事务实现，伪事务对象不会被直接访问。
    const result = await reviewSalaryNegotiationAndAdvanceTx(
      tx as never,
      {
        expectedVersion: 1,
        operatorId: null,
        organizationId: "org",
        recordId: "record",
      },
      {
        action: "review_salary_negotiation",
        expectedVersion: 1,
        reason: "双方未就薪资达成一致",
        result: "fail",
      },
      { advanceNode, recordAudit, updateExpectations, updateNode },
    );

    expect(updateExpectations).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(advanceNode).not.toHaveBeenCalled();
    expect(updateNode).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        node: "salary_negotiation",
        reason: "双方未就薪资达成一致",
        result: "fail",
        status: "completed",
      }),
    );
    expect(result).toMatchObject({ currentStage: "closed", outcome: "rejected" });
  });
});
