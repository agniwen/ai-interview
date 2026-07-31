// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { ResumeOverviewPanel } from "../resume-overview-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/features/resume/resume-profile-view", () => ({
  ResumeProfileView: () => <div>简历经历</div>,
}));

vi.mock("@/components/features/studio/job-descriptions/job-description-hover-card", () => ({
  JobDescriptionHoverCard: ({ name }: { name: string | null }) => <span>{name}</span>,
}));

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

const dimension = (rawScore: number, weight: number) => ({
  appliedDeductions: [],
  deductionTotal: 100 - rawScore,
  insufficientEvidenceRuleIds: [],
  rawScore,
  ruleJudgments: [],
  weight,
  weightedContributionHundredths: rawScore * weight,
});

function createStructuredDetail(): ResumeLibraryDetail {
  return {
    candidateEmail: null,
    candidateName: "测试候选人",
    candidatePhone: null,
    id: "resume-1",
    jobDescriptionId: "job-1",
    jobDescriptionName: "前端技术经理",
    jobEvaluationMode: "structured",
    resumeEvaluationStatus: null,
    resumeParseStatus: "ready",
    resumeProfile: null,
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
        priorityPointTotal: 5,
      },
      calculations: {
        adjustedHundredths: 8660,
        clampedHundredths: 8660,
        compositeScore: 87,
        weightedBaseHundredths: 8160,
      },
      dimensions: {
        educationBackground: dimension(80, 10),
        experienceRelevance: dimension(85, 25),
        potential: dimension(92, 8),
        projectMatch: dimension(88, 15),
        skillMatch: dimension(90, 35),
        stability: dimension(79, 7),
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

function createLegacyDetail(): ResumeLibraryDetail {
  return {
    ...createStructuredDetail(),
    jobEvaluationMode: "legacy",
    resumeReview: {
      nextStep: {
        action: "interview",
      },
      overall: {
        baseScore: 84,
        conclusion: "候选人与岗位高度匹配",
        scoreRationale: "六维度评分依据与详细扣分说明",
      },
    },
    structuredResumeEvaluation: null,
  } as unknown as ResumeLibraryDetail;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("ResumeOverviewPanel", () => {
  it("shows only the structured AI score conclusion in overview", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onViewAiScore = vi.fn();
    const queryClient = new QueryClient();

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ResumeOverviewPanel detail={createStructuredDetail()} onViewAiScore={onViewAiScore} />
        </QueryClientProvider>,
      );
    });

    const content = container.textContent ?? "";
    expect(content).toContain("AI评分");
    expect(content).toContain("推荐 · 87 分");
    expect(content).toContain("未通过门槛");
    expect(content).not.toContain("技能和经验整体匹配");
    expect(content).toContain("建议进入下一轮");
    expect(content).toContain("查看详情");
    expect(content).not.toContain("权重 35%");
    expect(content).not.toContain("最高学历为大专");
    expect(content).not.toContain("拥有支付行业经验");
    expect(content).not.toContain("硬性门槛");

    const detailButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "查看详情",
    );
    expect(detailButton).toBeDefined();
    act(() => detailButton?.click());
    expect(onViewAiScore).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("shows only the legacy AI score conclusion in overview", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient();

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ResumeOverviewPanel detail={createLegacyDetail()} onViewAiScore={() => {}} />
        </QueryClientProvider>,
      );
    });

    const content = container.textContent ?? "";
    expect(content).toContain("建议进入面试");
    expect(content).toContain("综合评分84");
    expect(content).toContain("候选人与岗位高度匹配");
    expect(content).toContain("查看详情");
    expect(content).not.toContain("六维度评分依据与详细扣分说明");
    expect(content).not.toContain("维度评分");

    act(() => root.unmount());
  });
});
