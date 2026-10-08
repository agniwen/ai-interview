// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { HumanInterviewReviewerEvaluationRecord } from "@app/shared/studio-pipeline-stages";
import { RoundEvaluation } from "./human-interview-evaluation-summary";

// SAFETY: Enable React's test-only act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const evaluation = {
  detailedAnalysis: "分析",
  evidenceTurnIds: [],
  overallEvaluation: "旧评价",
  professionalSkill: "良",
  rating: "B" as const,
  risks: "风险",
  rolePosition: "工程师",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "优势",
};
const container = document.createElement("div");
document.body.append(container);
let root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
});
function review(
  id: string,
  name: string,
  outcome: "pass" | "fail",
): HumanInterviewReviewerEvaluationRecord {
  return {
    evaluation: { ...evaluation, overallEvaluation: `${name}的意见` },
    id,
    legacy: false,
    outcome,
    reviewerId: id,
    reviewerName: name,
    submittedAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    version: 1,
  };
}
it("switches independent comments and outcomes by interviewer", async () => {
  await act(() =>
    root.render(
      <RoundEvaluation
        evaluation={evaluation}
        round={{
          evaluationStatus: "submitted",
          reviewerEvaluations: [review("a", "甲", "pass"), review("b", "乙", "fail")],
        }}
      />,
    ),
  );
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("甲的意见");
  expect(container.textContent).not.toContain("乙的意见");
  const [, second] = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  await act(() => second.click());
  expect(second.getAttribute("aria-selected")).toBe("true");
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("乙的意见");
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("不通过");
  expect(container.textContent).not.toContain("甲的意见");
});
it("preserves old evaluation when individual records are unavailable", async () => {
  await act(() =>
    root.render(
      <RoundEvaluation evaluation={evaluation} round={{ evaluationStatus: "submitted" }} />,
    ),
  );
  expect(container.textContent).toContain("旧评价");
  expect(container.querySelector('[role="tab"]')).toBeNull();
});
it("labels unattributed historical feedback without assigning it to an interviewer", async () => {
  const historical = {
    ...review("legacy", "历史评价（作者未知）", "pass"),
    legacy: true,
    reviewerId: null,
  };
  await act(() =>
    root.render(
      <RoundEvaluation
        evaluation={evaluation}
        round={{ evaluationStatus: "submitted", reviewerEvaluations: [historical] }}
      />,
    ),
  );
  expect(container.querySelector('[role="tab"]')?.textContent).toBe("历史评价（作者未知）");
});

it("hides missing fields and omits an empty details disclosure", async () => {
  await act(() =>
    root.render(
      <RoundEvaluation
        evaluation={{
          ...evaluation,
          detailedAnalysis: "\n",
          professionalSkill: " ",
          rating: null,
          risks: "—",
          rolePosition: "-",
          salaryRecommendation: "未提供",
          strengths: "",
        }}
        round={{ evaluationStatus: "submitted" }}
        compact
      />,
    ),
  );
  for (const label of [
    "评级",
    "专业技能",
    "角色定位",
    "薪资建议",
    "优势特点",
    "劣势风险",
    "完整详细分析",
    "展示详细分析结果",
  ]) {
    expect(container.textContent).not.toContain(label);
  }
  expect(container.textContent).toContain("旧评价");
});
