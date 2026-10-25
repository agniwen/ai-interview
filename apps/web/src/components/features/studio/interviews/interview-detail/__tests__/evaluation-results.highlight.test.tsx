import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvaluationOverall, EvidenceList, resolveEvaluationOverall } from "../evaluation-results";

const ALL_CATEGORIES = new Set(["skill", "metric", "risk"] as const);

describe("evaluation results", () => {
  it("highlights keywords in the overall assessment", () => {
    const overall = resolveEvaluationOverall(
      { overallAssessment: "整体擅长数据分析，带10人团队", questions: [] },
      null,
    );
    if (!overall) {
      throw new Error("expected an overall evaluation");
    }
    const html = renderToStaticMarkup(<EvaluationOverall overall={overall} />);
    expect(html).toContain('data-category="skill"');
    expect(html).toContain('data-category="metric"');
  });

  it("highlights keywords in evidence quotes", () => {
    const html = renderToStaticMarkup(
      <EvidenceList
        enabledCategories={ALL_CATEGORIES}
        evidence={[{ quote: "我主导了架构设计", turnIndex: 2 }]}
      />,
    );
    expect(html).toContain('data-category="skill"');
  });

  it("has nothing to show without a score, recommendation or assessment", () => {
    expect(resolveEvaluationOverall({ questions: [] }, null)).toBeNull();
  });

  it("flags a limited sample when fewer than half of the questions are scorable", () => {
    const overall = resolveEvaluationOverall({ questions: [] }, [
      {
        answerSummary: null,
        difficulty: "easy",
        endedAtSecs: 20,
        evaluationFocus: null,
        followUpCount: 0,
        followUpDirections: null,
        question: "尚未生成评估的题目",
        questionId: "question-1",
        reason: "time_limit",
        revision: 1,
        startedAtSecs: 10,
        status: "interrupted",
      },
    ]);
    expect(overall?.insufficientSample).toBe(true);
  });
});
