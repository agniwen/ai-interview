import { compileFollowUpContractsWithDefaults } from "./default-compile-follow-up-contracts";
import { describe, expect, it, vi } from "vitest";

const questions = [
  {
    content: "请提供最近工作的岗位。",
    difficulty: "medium" as const,
    evaluationFocus: "记录真实履历",
    followUpDirections: "缺失则追问",
    id: "question-1",
    sortOrder: 0,
  },
];

describe("compileFollowUpContractsWithDefaults", () => {
  it("retries invalid and transient model output and validates question semantics", async () => {
    type StructuredGenerator = NonNullable<
      Parameters<typeof compileFollowUpContractsWithDefaults>[1]
    >;
    const generateStructured = vi.fn<StructuredGenerator>((input) => {
      expect(input.retryOnInvalid).toBe(true);
      expect(input.retryOnTransient).toBe(true);
      expect(input.observabilityLabel).toBe("interview-question-follow-up-contracts");
      expect(() =>
        input.validate?.({
          contracts: [
            {
              coverageMode: "all_required",
              facets: [{ label: "岗位", sourceField: "question", sourceText: "岗位" }],
              questionId: "unknown-question",
            },
          ],
        }),
      ).toThrow("未知或重复题目");
      return Promise.resolve({
        contracts: [
          {
            coverageMode: "all_required",
            facets: [{ label: "岗位", sourceField: "question", sourceText: "岗位" }],
            questionId: "question-1",
          },
        ],
      });
    });

    await expect(
      compileFollowUpContractsWithDefaults(questions, generateStructured),
    ).resolves.toHaveProperty("size", 1);
  });
});
