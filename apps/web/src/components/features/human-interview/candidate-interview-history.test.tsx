// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CandidateInterviewHistory } from "./candidate-interview-history";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

describe("candidate interview history", () => {
  it("shows only the available AI evaluation when interview history is empty", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(() =>
      root.render(
        <CandidateInterviewHistory
          aiEvaluation={<p>简历 AI 评价内容</p>}
          aiEvaluationGeneratedAt="2026-09-01T10:00:00Z"
          data={{ hrInitialInformation: null, previousEvaluations: [] }}
        />,
      ),
    );
    expect(container.textContent).toContain("简历 AI 评价内容");
    expect(container.querySelector("button[aria-expanded]")?.textContent).toContain("2026");
    expect(container.textContent).not.toContain("暂无已提交的业务面评价");
    expect(container.textContent).not.toContain("HR 初面");
    expect(container.textContent).not.toContain("评级（A/B/C/D）");
    expect(
      container.querySelector("button[aria-expanded=true]")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("shows a business evaluation even without HR information and preserves a failed outcome", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(() =>
      root.render(
        <CandidateInterviewHistory
          aiEvaluation={<p>简历 AI 评价内容</p>}
          data={{
            hrInitialInformation: null,
            previousEvaluations: [
              {
                outcome: "fail",
                roundId: "previous",
                roundLabel: "业务一面",
                submittedAt: null,
                submittedBy: null,
                values: {
                  professionalSkill: "中",
                  rating: "C",
                  risks: "经验不足",
                  rolePosition: "执行员工",
                  salaryRecommendation: "",
                  seniorityPosition: "执行员工",
                  strengths: "基础扎实",
                },
              },
            ],
          }}
        />,
      ),
    );
    expect(container.textContent).toContain("不通过");
    expect(container.textContent).toContain("基础扎实");
    expect(container.textContent).toContain("未提供");
    expect(container.textContent).not.toContain("暂无已提交的业务面评价");
  });

  it("keeps HR information and shows submitted business evaluations with all evaluations expanded by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(() =>
      root.render(
        <CandidateInterviewHistory
          aiEvaluation={<p>简历 AI 评价内容</p>}
          data={{
            hrInitialInformation: {
              conversationId: "hr-1",
              generatedAt: "2026-09-01T10:00:00Z",
              roundLabel: "一面",
              values: {
                availability: "一个月内到岗",
                careerProgression: null,
                compensationExpectations: null,
                jobMotivation: "寻找技术管理机会",
                overseasTravel: null,
                projectHighlights: null,
                recentWork: null,
              },
            },
            previousEvaluations: ["业务一面", "业务二面"].map((roundLabel, index) => ({
              outcome: "pass",
              roundId: `round-${index}`,
              roundLabel,
              submittedAt: "2026-09-02T10:00:00Z",
              submittedBy: "张面试官",
              values: {
                professionalSkill: "良",
                rating: "B",
                risks: "缺少大规模团队经验",
                rolePosition: "主导决策者",
                salaryRecommendation: "30K",
                seniorityPosition: "小组主管",
                strengths: "工程实践扎实",
              },
            })),
          }}
        />,
      ),
    );

    const triggers = [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
    expect(triggers.map((trigger) => trigger.querySelector("span > span")?.textContent)).toEqual([
      "业务二面",
      "业务一面",
      "HR 初面",
      "AI 评价",
    ]);
    expect(triggers[0]?.textContent).toMatch(/2026/);
    expect(triggers[2]?.textContent).toMatch(/2026/);
    expect(triggers.map((trigger) => trigger.getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      "true",
      "true",
    ]);
    for (const text of [
      "面试官：张面试官",
      "评级（A/B/C/D）",
      "通过",
      "职级定位",
      "小组主管",
      "角色定位",
      "主导决策者",
      "专业技能",
      "优势特点",
      "工程实践扎实",
      "劣势风险",
      "薪资建议",
      "30K",
    ]) {
      expect(container.textContent).toContain(text);
    }
    expect(container.textContent).toContain("寻找技术管理机会");
    expect(container.textContent).toContain("未收集到相关信息");
    expect(container.textContent).toContain("简历 AI 评价内容");
    await act(() => triggers[2]?.click());
    expect(triggers[2]?.getAttribute("aria-expanded")).toBe("false");
    expect(triggers[3]?.getAttribute("aria-expanded")).toBe("true");
  });
});
