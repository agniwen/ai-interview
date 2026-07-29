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

const dimension = (rawScore: number, weight: number) => ({
  appliedDeductions: [],
  deductionTotal: 100 - rawScore,
  insufficientEvidenceRuleIds: [],
  rawScore,
  ruleJudgments: [
    {
      evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
      reason: "具备核心项目经验",
      ruleId: "project.edge_participation",
      status: "not_matched",
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
        educationBackground: dimension(80, 10),
        experienceRelevance: dimension(85, 25),
        potential: dimension(92, 8),
        projectMatch: dimension(88, 15),
        skillMatch: dimension(90, 0),
        stability: dimension(79, 42),
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
    expect(content).toContain("推荐 · 87 分");
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

    act(() => root.unmount());
  });
});
