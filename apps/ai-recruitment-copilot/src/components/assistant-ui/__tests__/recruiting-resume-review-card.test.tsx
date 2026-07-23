// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import {
  buildRecruitingResumeReviewCardModel,
  RecruitingResumeReviewCard,
} from "../recruiting-resume-review-card";

const mocks = vi.hoisted(() => ({
  openResumeDetail: vi.fn(),
}));

vi.mock("../recruiting-copilot-context", () => ({
  useRecruitingCopilotContext: () => ({
    openResumeDetail: mocks.openResumeDetail,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("opens the candidate detail directly on the AI score tab", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
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
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll("meter")).toHaveLength(6);
    const detailButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("AI评分详情"),
    );
    expect(detailButton).toBeDefined();
    await act(async () => {
      detailButton?.click();
      await Promise.resolve();
    });
    expect(mocks.openResumeDetail).toHaveBeenCalledWith("resume-1", "ai-analysis");

    act(() => root.unmount());
    container.remove();
  });
});
