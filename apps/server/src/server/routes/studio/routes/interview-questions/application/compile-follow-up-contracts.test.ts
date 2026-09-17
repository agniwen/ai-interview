import { describe, expect, it, vi } from "vitest";
import {
  attachFollowUpContracts,
  compileFollowUpContracts,
  normalizeCompiledFollowUpContracts,
  questionsRequiringFollowUpContracts,
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
  it("skips model generation when no questions need contracts", async () => {
    const generate = vi.fn();
    const selected = questionsRequiringFollowUpContracts([
      { ...questions[0], evaluationFocus: null, followUpDirections: "   " },
    ]);

    const contracts = await compileFollowUpContracts(selected, generate);

    expect(generate).not.toHaveBeenCalled();
    expect(attachFollowUpContracts(questions, contracts)[0].followUpContract).toBeNull();
  });

  it("saves a mix of generated and explicitly unnecessary contracts", async () => {
    const mixedQuestions = [questions[0], { ...questions[0], content: "你好。", id: "greeting" }];
    const generate = vi.fn().mockResolvedValue({
      contracts: [
        {
          coverageMode: "all_required",
          facets: [{ label: "岗位", sourceField: "question", sourceText: "岗位" }],
          questionId: "question-1",
        },
        { coverageMode: null, facets: [], questionId: "greeting" },
      ],
    });

    const contracts = await compileFollowUpContracts(mixedQuestions, generate);
    const snapshot = attachFollowUpContracts(mixedQuestions, contracts);

    expect(snapshot[0].followUpContract?.coverageMode).toBe("all_required");
    expect(snapshot[1].followUpContract).toBeNull();
    expect(contracts.size).toBe(1);
  });

  it("rejects missing or duplicate results even when contracts are unnecessary", () => {
    const empty = { coverageMode: null, facets: [], questionId: "question-1" };
    expect(() => normalizeCompiledFollowUpContracts(questions, { contracts: [] })).toThrow(
      "数量与题目数量不一致",
    );
    expect(() =>
      normalizeCompiledFollowUpContracts([...questions, { ...questions[0], id: "question-2" }], {
        contracts: [empty, empty],
      }),
    ).toThrow("未知或重复题目");
  });

  it("rejects contradictory empty-contract results", () => {
    expect(() =>
      normalizeCompiledFollowUpContracts(questions, {
        contracts: [{ coverageMode: "all_required", facets: [], questionId: "question-1" }],
      }),
    ).toThrow("没有有效信息项");
    expect(() =>
      normalizeCompiledFollowUpContracts(questions, {
        contracts: [
          {
            coverageMode: null,
            facets: [{ label: "岗位", sourceField: "question", sourceText: "岗位" }],
            questionId: "question-1",
          },
        ],
      }),
    ).toThrow("无需追问契约的题目不能包含信息项");
  });

  it("selects questions that configure evaluation focus or follow-up directions", () => {
    expect(
      questionsRequiringFollowUpContracts([
        questions[0],
        {
          ...questions[0],
          evaluationFocus: "只配置考核点",
          followUpDirections: "   ",
          id: "question-with-evaluation-focus",
        },
        {
          ...questions[0],
          evaluationFocus: null,
          followUpDirections: null,
          id: "question-without-contract-config",
        },
      ]).map((question) => question.id),
    ).toEqual(["question-1", "question-with-evaluation-focus"]);
  });

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

  it("gives the model adapter semantic validation for retry feedback", async () => {
    const validOutput = {
      contracts: [
        {
          coverageMode: "all_required" as const,
          facets: [{ label: "岗位", sourceField: "question" as const, sourceText: "岗位" }],
          questionId: "question-1",
        },
      ],
    };
    const generate = vi.fn().mockImplementation((input) => {
      expect(input.validate).toBeTypeOf("function");
      expect(() =>
        input.validate?.({
          ...validOutput,
          contracts: [{ ...validOutput.contracts[0], questionId: "unknown-question" }],
        }),
      ).toThrow("未知或重复题目");
      expect(() => input.validate?.(validOutput)).not.toThrow();
      return Promise.resolve(validOutput);
    });

    await expect(compileFollowUpContracts(questions, generate)).resolves.toHaveProperty("size", 1);
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
