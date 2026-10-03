// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateInterviewHistory } from "./candidate-interview-history";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
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
                submittedByImage: null,
                values: {
                  overallEvaluation: "",
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
    const overall = [...container.querySelectorAll("section")].find(
      (section) => section.querySelector("h3")?.textContent === "整体评价",
    );
    expect(overall?.querySelector("p")?.textContent).toBe("未提供");
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
              submittedByImage: null,
              values: {
                overallEvaluation: "**整体符合岗位要求**\n\n- 技术扎实\n- 沟通清晰\n\n1. 继续面试",
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

    expect(
      [...container.querySelectorAll("section > h3")]
        .slice(7, 10)
        .map((heading) => heading.textContent),
    ).toEqual(["评级（A/B/C/D）", "整体评价", "角色定位"]);
    const overallSection = [...container.querySelectorAll("section")].find(
      (section) => section.querySelector("h3")?.textContent === "整体评价",
    );
    expect(overallSection?.querySelector("strong")?.textContent).toBe("整体符合岗位要求");
    expect(overallSection?.querySelectorAll("ul > li")).toHaveLength(2);
    expect(overallSection?.querySelector("ol > li")?.textContent).toBe("继续面试");
    expect(overallSection?.textContent).not.toContain("**");
    const triggers = [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
    expect(triggers.map((trigger) => trigger.querySelector("span > span")?.textContent)).toEqual([
      "AI 评价",
      "HR 初面",
      "业务一面",
      "业务二面",
    ]);
    expect(
      [...container.querySelectorAll<HTMLElement>("[data-evaluation-id]")].map(
        (item) => item.dataset.evaluationId,
      ),
    ).toEqual(["ai-evaluation", "hr-initial", "round-0", "round-1"]);
    expect(
      [...container.querySelectorAll('nav[aria-label="评价时间线"] button')].map(
        (button) => button.querySelector("[title]")?.textContent,
      ),
    ).toEqual(["AI 评价", "HR 初面", "业务一面", "业务二面"]);
    expect(triggers[1]?.textContent).toMatch(/2026/);
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
    await act(() => triggers[1]?.click());
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("false");
    expect(triggers[3]?.getAttribute("aria-expanded")).toBe("true");
  });
});
