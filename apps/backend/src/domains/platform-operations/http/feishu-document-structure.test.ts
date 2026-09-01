import { describe, expect, it } from "vitest";
import { planDocumentSections } from "./feishu-document-structure.js";

describe("planDocumentSections", () => {
  it("relocates recommended questions between HR evaluation and rating", () => {
    expect(
      planDocumentSections(
        ["推荐面试题", "HR面试评价", "评级等级确定"],
        new Set(["recommendedQuestions"]),
      ),
    ).toMatchObject({
      questionsIndex: 0,
      questionsInsertIndex: 2,
      relocateQuestions: true,
    });
  });

  it("keeps a correctly placed recommended question section in place", () => {
    expect(
      planDocumentSections(
        ["HR面试评价", "推荐面试题", "评级等级确定"],
        new Set(["recommendedQuestions"]),
      ).relocateQuestions,
    ).toBe(false);
  });

  it("inserts resume evaluation immediately before HR evaluation", () => {
    expect(
      planDocumentSections(
        ["候选人信息", "HR面试评价", "评级等级确定"],
        new Set(["resumeEvaluation"]),
      ).resumeInsertIndex,
    ).toBe(1);
  });

  it("refuses mutation when structural anchors are absent", () => {
    expect(() => planDocumentSections(["候选人信息"], new Set(["recommendedQuestions"]))).toThrow(
      "结构锚点",
    );
  });
});
