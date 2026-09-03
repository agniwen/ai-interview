// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { QualitativeResumeEvaluationV2 } from "@app/db-schema/qualitative-resume-evaluation";
import type { ResumeReviewLoose } from "@app/shared/resume-review";
import { installNoopResizeObserver } from "@/test-utils/react-act";
import {
  buildRecruitingResumeReviewCardModel,
  RecruitingResumeReviewCard,
} from "../recruiting-resume-review-card";
import type { RecruitingCopilotContextValue } from "../recruiting-copilot-context";
import { RecruitingCopilotContext } from "../recruiting-copilot-context";

const openResumeDetail = vi.fn();
const contextValue = {
  citations: [],
  conversationId: null,
  markProposal: vi.fn(),
  openCandidateDetail: vi.fn(),
  openResumeDetail,
  openResumePreview: vi.fn(),
  proposalStatuses: {},
  proposals: [],
  upsertCitations: vi.fn(),
  upsertProposal: vi.fn(),
} satisfies RecruitingCopilotContextValue;

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();

const review: ResumeReviewLoose = {
  biasScan: { items: [] },
  dimensions: {
    educationBackground: { rationale: "学历符合要求", score: 80 },
    experienceRelevance: { rationale: "经验相关", score: 88 },
    potential: { rationale: "成长性良好", score: 82 },
    projectMatch: { rationale: "项目匹配", score: 86 },
    skillMatch: { rationale: "核心技能匹配", score: 92 },
    stability: { rationale: "履历稳定", score: 78 },
  },
  levelRecommendation: { level: "高级", rationale: "经验充分" },
  nextStep: {
    action: "interview",
    disclaimer: "以上为初步结论",
    interviewFocus: ["系统设计"],
    rationale: "建议进入面试",
  },
  overall: {
    baseScore: 87,
    conclusion: "整体匹配",
    scoreRationale: "六维加权",
  },
  schemaVersion: 4,
  strengths: [{ evidence: "项目经历", impact: "可快速上手", point: "经验丰富" }],
  teamPositioning: { rationale: "能力匹配", suggestion: "核心开发" },
  weaknesses: [{ evidence: null, impact: "需要验证", point: "管理经验有限" }],
};

const qualitativeReview: QualitativeResumeEvaluationV2 = {
  conciseOverall: "核心技能和项目经历与岗位高度匹配，建议优先推进。",
  detailedOverall: {
    judgment: "候选人的前端工程能力与岗位要求高度一致。",
    matchingEvidence: "具备 React、TypeScript 和复杂项目交付经验。",
    risks: "管理经验仍需在面试中确认。",
  },
  dimensions: {
    educationBackground: {
      basis: "job",
      evaluation: "教育背景满足岗位要求。",
      level: "recommended",
    },
    experienceRelevance: {
      basis: "both",
      evaluation: "五年前端经验与岗位职责高度相关。",
      level: "highly_recommended",
    },
    potential: {
      basis: "general",
      evaluation: "持续承担更复杂职责，成长路径清晰。",
      level: "recommended",
    },
    projectMatch: {
      basis: "job",
      evaluation: "主导过与岗位场景相近的复杂项目。",
      level: "highly_recommended",
    },
    skillMatch: {
      basis: "job",
      evaluation: "React 与 TypeScript 实践符合核心要求。",
      level: "highly_recommended",
    },
    stability: {
      basis: "general",
      evaluation: "任职变化具有连贯的职责升级。",
      level: "undecided",
    },
  },
  recommendationLevel: "highly_recommended",
  schemaVersion: 2,
  seniorityRecommendation: null,
  teamPositioning: null,
};

describe("buildRecruitingResumeReviewCardModel", () => {
  it("returns the stored base score and all six product dimensions", () => {
    const model = buildRecruitingResumeReviewCardModel(review);

    expect(model.baseScore).toBe(87);
    expect(model.dimensions).toHaveLength(6);
    expect(model.dimensions.map((dimension) => dimension.label)).toEqual([
      "技能匹配度",
      "经验相关性",
      "项目匹配度",
      "学历/背景",
      "潜力评估",
      "稳定性评估",
    ]);
    expect(model.dimensions[0]?.score).toBe(92);
  });

  it("keeps six empty slots when no database review exists", () => {
    const model = buildRecruitingResumeReviewCardModel(null);

    expect(model.baseScore).toBeNull();
    expect(model.dimensions).toHaveLength(6);
    expect(model.dimensions.every((dimension) => dimension.score === null)).toBe(true);
  });

  it("renders a structured score when the legacy review is empty", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RecruitingCopilotContext.Provider value={contextValue}>
          <RecruitingResumeReviewCard
            record={{
              candidateName: "结构化候选人",
              citation: {
                id: "resume-structured",
                label: "结构化候选人",
                recordType: "resume_record",
                secondaryLabel: "运营岗位",
              },
              id: "resume-structured",
              jobDescriptionId: "jd-community-operations",
              jobDescriptionName: "运营岗位",
              resumeEvaluationArtifactMode: "structured",
              resumeReview: null,
              structuredResumeReview: {
                adjustments: [],
                compositeScore: 100,
                dimensions: {
                  educationBackground: {
                    rationale: "学历符合岗位要求",
                    score: 100,
                    weight: 10,
                  },
                  experienceRelevance: {
                    rationale: "运营经验高度相关",
                    score: 100,
                    weight: 25,
                  },
                  potential: { rationale: "具备成长潜力", score: 100, weight: 8 },
                  projectMatch: { rationale: "项目经验匹配", score: 100, weight: 15 },
                  skillMatch: { rationale: "核心技能匹配", score: 100, weight: 35 },
                  stability: { rationale: "履历稳定", score: 100, weight: 7 },
                },
                gateJudgments: [],
                gateStatus: "passed",
                grade: "recommended",
                overallComment: "岗位匹配度高",
                recommendation: "建议进入下一轮",
                summary: "六维表现均衡",
              },
            }}
          />
        </RecruitingCopilotContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("推荐");
    expect(container.textContent).toContain("门槛通过");
    expect(container.textContent).not.toContain("尚未生成");

    act(() => root.unmount());
    container.remove();
  });

  it("renders the current qualitative six-dimension evaluation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RecruitingCopilotContext.Provider value={contextValue}>
          <RecruitingResumeReviewCard
            record={{
              candidateName: "定性评价候选人",
              citation: {
                id: "resume-qualitative",
                label: "定性评价候选人",
                recordType: "resume_record",
                secondaryLabel: "高级前端工程师",
              },
              id: "resume-qualitative",
              jobDescriptionId: "jd-frontend",
              jobDescriptionName: "高级前端工程师",
              qualitativeResumeEvaluation: qualitativeReview,
              resumeEvaluationArtifactMode: "qualitative",
              resumeReview: null,
              structuredResumeReview: null,
            }}
          />
        </RecruitingCopilotContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("非常推荐");
    expect(container.textContent).toContain("核心技能和项目经历与岗位高度匹配");
    expect(container.textContent).toContain("技能匹配");
    expect(container.textContent).toContain("待定");
    expect(container.textContent).not.toContain("暂无维度评分");
    expect(container.querySelector('[aria-label="简历六维定性评价雷达图"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("opens the candidate detail directly on the AI score tab", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RecruitingCopilotContext.Provider value={contextValue}>
          <RecruitingResumeReviewCard
            record={{
              candidateName: "张三",
              citation: {
                id: "resume-1",
                label: "张三",
                recordType: "resume_record",
                secondaryLabel: "前端工程师",
              },
              id: "resume-1",
              jobDescriptionId: "jd-1",
              jobDescriptionName: "前端工程师",
              resumeReview: review,
            }}
          />
        </RecruitingCopilotContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector("[data-chart]")).not.toBeNull();
    expect(container.querySelectorAll("dt")).toHaveLength(6);
    expect(container.querySelector("section")?.className).toContain("my-3");
    const detailButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("查看评分详情"),
    );
    expect(detailButton).toBeDefined();
    await act(async () => {
      detailButton?.click();
      await Promise.resolve();
    });
    expect(openResumeDetail).toHaveBeenCalledWith("resume-1", "ai-analysis");

    act(() => root.unmount());
    container.remove();
  });
});
