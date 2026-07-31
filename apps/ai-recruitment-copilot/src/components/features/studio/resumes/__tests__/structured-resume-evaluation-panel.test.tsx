// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { StructuredResumeEvaluationPanel } from "../structured-resume-evaluation-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  PolarAngleAxis: () => null,
  PolarGrid: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  RadarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const dimension = (rawScore: number, weight: number, ruleId: string, reason: string) => ({
  appliedDeductions:
    rawScore < 100
      ? [
          {
            appliedPoints: 100 - rawScore,
            evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
            reason,
            ruleId,
            status: "matched",
          },
        ]
      : [],
  deductionTotal: 100 - rawScore,
  insufficientEvidenceRuleIds: [],
  rawScore,
  ruleJudgments: [
    {
      evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
      reason,
      ruleId,
      status: rawScore < 100 ? "matched" : "not_matched",
    },
  ],
  weight,
  weightedContributionHundredths: rawScore * weight,
});

function createDetail(): ResumeLibraryDetail {
  return {
    id: "resume-1",
    jobEvaluationMode: "structured",
    resumeEvaluationStatus: "pass",
    resumeReviewRunId: "run-1",
    resumeReviewStatus: "ready",
    structuredResumeEvaluation: {
      adjustments: {
        exclusionPointTotal: 0,
        matches: [
          {
            appliedPoints: 5,
            conditionId: "priority-1",
            evidence: [{ quote: "拥有支付行业经验", source: "resume_text" }],
            kind: "priority",
            matched: true,
            points: 5,
            reason: "符合优先条件",
            sourceText: "支付行业经验",
          },
        ],
        priorityPointTotal: 0,
      },
      calculations: {
        adjustedHundredths: 8660,
        clampedHundredths: 8660,
        compositeScore: 87,
        weightedBaseHundredths: 8660,
      },
      dimensions: {
        educationBackground: dimension(80, 10, "education.below_tier", "学历低于岗位要求"),
        experienceRelevance: dimension(85, 25, "experience.missing_year", "相关经验缺少两年"),
        potential: dimension(92, 8, "potential.no_growth_two_years", "近期成长记录不足"),
        projectMatch: dimension(88, 15, "project.old_relevant_project", "相关项目距今较久"),
        skillMatch: dimension(90, 0, "skill.missing_core", "缺少核心技能"),
        stability: dimension(79, 42, "stability.short_tenure", "存在短期任职经历"),
      },
      gates: {
        effectiveStatus: "failed",
        judgments: [
          {
            aiStatus: "failed",
            category: "学历",
            evidence: [{ quote: "最高学历为大专", source: "resume_profile" }],
            reason: "未达到本科要求",
            requirementId: "gate-1",
          },
        ],
        rawStatus: "failed",
      },
      grade: "recommended",
      narrative: {
        recommendation: "建议进入下一轮",
        summary: "技能和经验整体匹配",
      },
      runId: "run-1",
    },
  } as unknown as ResumeLibraryDetail;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StructuredResumeEvaluationPanel", () => {
  it("keeps HR decision primary and renders all raw dimensions including zero weight", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StructuredResumeEvaluationPanel canEdit={false} detail={createDetail()} />);
    });

    const content = container.textContent ?? "";
    expect(content).toContain("HR 已通过");
    expect(content).toContain("未通过门槛");
    expect(content).toContain("推荐");
    expect(container.querySelector("[data-structured-composite-score]")?.textContent).toBe("87");
    expect(content).toContain("技能");
    expect(content).toContain("经验");
    expect(content).toContain("项目");
    expect(content).toContain("学历");
    expect(content).toContain("潜力");
    expect(content).toContain("稳定");
    expect(content).toContain("权重 0% · 贡献 0 分");
    expect(content).toContain("最高学历为大专");
    expect(content).toContain("主导支付系统重构");
    expect(content).toContain("拥有支付行业经验");
    expect(content).toContain("AI 原始结论：");

    const frameTitles = Array.from(
      container.querySelectorAll('[data-slot="frame-panel-title"]'),
      (element) => element.textContent,
    );
    expect(frameTitles.slice(0, 2)).toEqual(["综合评价", "维度评分"]);
    expect(container.querySelectorAll("[data-structured-dimension-group]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-structured-dimension-score]")).toHaveLength(6);
    const experienceDimension = container.querySelector(
      '[data-structured-dimension-score="experienceRelevance"]',
    );
    expect(experienceDimension?.textContent).toContain("标准化扣分明细");
    expect(experienceDimension?.textContent).toContain("经验年限不足");
    expect(experienceDimension?.textContent).toContain("-15 分");
    expect(experienceDimension?.textContent).toContain("相关经验缺少两年");
    expect(frameTitles).not.toContain("标准化扣分明细");

    act(() => root.unmount());
  });

  it("labels a retained prior result when the latest reassessment fails", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const detail = {
      ...createDetail(),
      resumeReviewError: "AI 分析生成失败。",
      resumeReviewRunId: "run-2",
      resumeReviewStatus: "failed",
    } as ResumeLibraryDetail;

    act(() => {
      root.render(<StructuredResumeEvaluationPanel canEdit={false} detail={detail} />);
    });

    expect(container.textContent).toContain("AI 分析生成失败。");
    expect(container.textContent).toContain("当前展示上一次已完成的评估结果");
    expect(container.querySelector("[data-structured-composite-score]")?.textContent).toBe("87");

    act(() => root.unmount());
  });

  it("does not allow correcting gates on a retained result from an older run", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const detail = {
      ...createDetail(),
      resumeReviewRunId: "run-2",
      resumeReviewStatus: "processing",
    } as ResumeLibraryDetail;

    act(() => {
      root.render(
        <StructuredResumeEvaluationPanel
          canEdit
          detail={detail}
          onUpdated={vi.fn()}
          slug="light"
        />,
      );
    });

    expect(container.textContent).toContain("当前展示上一次已完成的评估结果");
    expect(container.textContent).not.toContain("标记通过");
    expect(container.textContent).not.toContain("标记未通过");

    act(() => root.unmount());
  });
});
