import { describe, expect, it, vi } from "vitest";
import {
  compileFollowUpContracts,
  normalizeCompiledFollowUpContracts,
} from "./compile-follow-up-contracts";

const questions = [
  {
    content: "请提供最近工作的岗位、团队情况和汇报对象。",
    difficulty: "medium" as const,
    evaluationFocus: "记录真实履历",
    followUpDirections: "缺失则追问",
    id: "question-1",
    sortOrder: 0,
  },
];

describe("compileFollowUpContracts", () => {
  it("compiles configurable question text into grounded dynamic facets", async () => {
    const generate = vi.fn().mockResolvedValue({
      contracts: [
        {
          coverageMode: "all_required",
          facets: [
            { label: "岗位", sourceField: "question", sourceText: "岗位" },
            { label: "团队情况", sourceField: "question", sourceText: "团队情况" },
            { label: "汇报对象", sourceField: "question", sourceText: "汇报对象" },
          ],
          questionId: "question-1",
        },
      ],
    });

    const result = await compileFollowUpContracts(questions, generate);

    expect(result.get("question-1")).toMatchObject({
      coverageMode: "all_required",
      facets: [
        { label: "岗位", sourceText: "岗位" },
        { label: "团队情况", sourceText: "团队情况" },
        { label: "汇报对象", sourceText: "汇报对象" },
      ],
      schemaVersion: 1,
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("keeps semantic decomposition with the compiler instead of parsing Chinese in code", () => {
    const result = normalizeCompiledFollowUpContracts(
      [
        {
          content: "方便了解下您目前看机会的核心关注点或者求职动机",
          difficulty: "easy",
          id: "motivation",
          sortOrder: 0,
        },
      ],
      {
        contracts: [
          {
            coverageMode: "sufficient_for_evaluation",
            facets: [
              {
                label: "看机会核心关注点",
                sourceField: "question",
                sourceText: "看机会核心关注点",
              },
            ],
            questionId: "motivation",
          },
        ],
      },
    );

    expect(result.get("motivation")?.facets[0]?.sourceText).toBe("看机会核心关注点");
  });
});
