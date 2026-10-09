import { compileFollowUpContractsWithDefaults } from "./default-compile-follow-up-contracts";
import { describe, expect, it, vi } from "vitest";
import { generateStructuredWithMastraAgent } from "@app/ai-runtime/simple-generators";
import type { MastraGeneratorLike } from "@app/ai-runtime/simple-generators";

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
  it.each([
    { label: "missing contracts", output: {} },
    {
      label: "invalid contract fields",
      output: {
        contracts: [{ facets: [{ label: "岗位", sourceText: "岗位" }], questionId: "question-1" }],
      },
    },
    {
      label: "contradictory empty contract",
      output: {
        contracts: [{ coverageMode: "all_required", facets: [], questionId: "question-1" }],
      },
    },
  ])(
    "retries $label in text JSON mode and accepts an explicit null contract",
    async ({ output }) => {
      const generate = vi
        .fn<MastraGeneratorLike["generate"]>()
        .mockResolvedValueOnce({ text: JSON.stringify(output) })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            contracts: [{ coverageMode: null, facets: [], questionId: "question-1" }],
          }),
        });

      const result = await compileFollowUpContractsWithDefaults(questions, (input) =>
        generateStructuredWithMastraAgent({
          ...input,
          agent: { generate },
          textGenerationFirst: true,
        }),
      );

      expect(result.size).toBe(0);
      expect(generate).toHaveBeenCalledTimes(2);
      const [[prompt]] = generate.mock.calls;
      const example = prompt.slice(
        prompt.indexOf('{\n  "contracts"'),
        prompt.indexOf("\n- 顶层字段"),
      );
      expect(JSON.parse(example).contracts).toHaveLength(2);
      expect(prompt).toContain('"evaluation_focus"、"follow_up_directions"');
      expect(generate.mock.calls[1][0]).toContain("上一次结构化输出无效");
    },
  );

  it("does not turn persistent malformed output into a null contract", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "{}" });
    await expect(
      compileFollowUpContractsWithDefaults(questions, (input) =>
        generateStructuredWithMastraAgent({
          ...input,
          agent: { generate },
          textGenerationFirst: true,
        }),
      ),
    ).rejects.toThrow("Schema validation failed");
    expect(generate).toHaveBeenCalledTimes(2);
  });

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
