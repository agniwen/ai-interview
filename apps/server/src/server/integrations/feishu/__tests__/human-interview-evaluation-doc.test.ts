import { describe, expect, it } from "vitest";
import { buildHumanInterviewEvaluationBlock } from "../human-interview-evaluation-doc";

describe("human interview evaluation document", () => {
  it("includes the confirmed evaluation, outcome and actual round without rewriting it", () => {
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
      roundLabel: "架构复面",
      submittedAt: "2026-09-02T03:00:00.000Z",
      submittedBy: "张面试官",
    });
    const text = JSON.stringify(block);
    for (const expected of [
      "架构复面",
      "张面试官",
      "待定",
      "需要核实架构设计职责。",
      "保留原话 **重点**",
      "良，熟悉分布式系统",
      "故障定位清晰",
      "项目职责待确认",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("turn-1");
  });
});
