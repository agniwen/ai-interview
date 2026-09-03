import { describe, expect, it } from "vitest";
import { buildHumanInterviewEvaluationBlock } from "../human-interview-evaluation-doc";

describe("human interview evaluation document", () => {
  it.each([
    ["pass", "通过"],
    ["fail", "不通过"],
  ] as const)("adds the %s decision after the rating", (outcome, label) => {
    const block = buildHumanInterviewEvaluationBlock({
      evaluation: {
        detailedAnalysis: "",
        evidenceTurnIds: [],
        overallEvaluation: "评价",
        professionalSkill: "中",
        rating: "C",
        risks: "风险",
        rolePosition: "执行",
        salaryRecommendation: "",
        seniorityPosition: "高级",
        strengths: "优势",
      },
      outcome,
      roundLabel: "业务一面",
      submittedAt: "2026-09-02",
      submittedBy: "面试官",
    });
    expect(block.children?.[2]?.text?.elements[0]?.text_run?.content).toBe(
      `评级（A,B,C,D）：C（${label}）`,
    );
  });
  it.each(["架构复面", "业务一面", "CEO面试"])(
    "syncs only template evaluation fields for %s without rewriting them",
    (roundLabel) => {
      const block = buildHumanInterviewEvaluationBlock({
        evaluation: {
          detailedAnalysis: "保留原话 **重点**",
          evidenceTurnIds: ["turn-1"],
          overallEvaluation: "需要核实架构设计职责。",
          professionalSkill: "良，熟悉分布式系统",
          rating: "B",
          risks: "项目职责待确认",
          rolePosition: "执行员工",
          salaryRecommendation: "",
          seniorityPosition: "高级",
          strengths: "故障定位清晰",
        },
        outcome: "inconclusive",
        roundLabel,
        submittedAt: "2026-09-02T03:00:00.000Z",
        submittedBy: "张面试官",
      });
      const fields = block.children?.map((child) =>
        child.text?.elements.map((element) => element.text_run?.content ?? "").join(""),
      );
      expect(fields).toEqual([
        `${roundLabel}评价`,
        "面试官：张面试官",
        "评级（A,B,C,D）：B",
        "职级定位：高级",
        "角色定位：执行员工",
        "专业技能：良，熟悉分布式系统",
        "优势特点：故障定位清晰",
        "劣势风险：项目职责待确认",
        "薪资建议：未提供",
      ]);
    },
  );
});
