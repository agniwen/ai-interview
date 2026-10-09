import { describe, expect, it, vi } from "vitest";
import { transitionRecruitingNodeTx } from "./recruiting-pipeline";

// Exercise the real transition before any persistence is allowed.
function transition(status: string) {
  const insert = vi.fn(() => {
    throw new Error("transition reached persistence");
  });
  const record = {
    currentStage: "second_interview",
    id: "record",
    outcome: "in_pipeline",
    version: 1,
  };
  let reads = 0;
  // SAFETY: This fixture implements the two reads and the first write used by the transition.
  const tx = {
    insert,
    select: () => ({
      from: () => ({
        where: () => {
          reads += 1;
          return reads === 1
            ? { for: () => Promise.resolve([record]) }
            : Promise.resolve([
                { node: "screening", result: "pass", status: "completed" },
                { node: "second_interview", result: null, status },
              ]);
        },
      }),
    }),
  } as never;
  return {
    insert,
    result: transitionRecruitingNodeTx(tx, {
      operatorId: null,
      organizationId: "org",
      reason: "直接进入终试",
      recordId: "record",
      skipNodes: ["second_interview"],
      targetNode: "final_interview",
    }),
  };
}

describe("human interview transition guard", () => {
  it.each(["scheduled", "in_progress", "awaiting_review"])(
    "rejects skipping a %s interview before any write",
    async (status) => {
      const attempt = transition(status);
      await expect(attempt.result).rejects.toThrow("当前面试尚未完成");
      expect(attempt.insert).not.toHaveBeenCalled();
    },
  );
  it.each(["pending", "completed"])("preserves explicit skip for %s nodes", async (status) => {
    const attempt = transition(status);
    await expect(attempt.result).rejects.toThrow("transition reached persistence");
    expect(attempt.insert).toHaveBeenCalledOnce();
  });
});
