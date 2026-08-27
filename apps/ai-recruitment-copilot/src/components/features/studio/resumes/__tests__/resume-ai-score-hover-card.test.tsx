// @vitest-environment jsdom

import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumeAiScoreHoverCardView } from "../resume-ai-score-hover-card";
import type { ResumeAiScoreDependencies } from "../resume-ai-score-hover-card";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchStudioResumeReviewMock = vi.fn<ResumeAiScoreDependencies["fetchReview"]>();
const getRevealState = () =>
  document.body.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state;

function createLegacyDetail(): ResumeLibraryDetail {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return {
    candidateName: "张三",
    resumeEvaluationArtifactMode: "legacy",
    resumeReview: {
      dimensions: {
        educationBackground: { rationale: "学历符合要求", score: 80 },
        experienceRelevance: { rationale: "经验能够支撑岗位职责", score: 86 },
        potential: { rationale: "成长轨迹清晰", score: 82 },
        projectMatch: { rationale: "项目复杂度符合预期", score: 85 },
        skillMatch: { rationale: "核心技能匹配", score: 88 },
        stability: { rationale: "任职经历较稳定", score: 78 },
      },
      overall: {
        baseScore: 84,
        conclusion: "候选人与岗位高度匹配",
        scoreRationale: "技能和经验与岗位要求较为一致。",
      },
    },
    structuredResumeEvaluation: null,
  } as ResumeLibraryDetail;
}

function createStructuredDetail(): ResumeLibraryDetail {
  const dimensions = {
    educationBackground: { rawScore: 80, weight: 10 },
    experienceRelevance: { rawScore: 86, weight: 25 },
    potential: { rawScore: 82, weight: 8 },
    projectMatch: { rawScore: 85, weight: 15 },
    skillMatch: { rawScore: 88, weight: 35 },
    stability: { rawScore: 78, weight: 7 },
  };
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return {
    candidateName: "李四",
    resumeEvaluationArtifactMode: "structured",
    resumeReview: null,
    structuredResumeEvaluation: {
      calculations: { compositeScore: 84 },
      dimensions,
      gates: { effectiveStatus: "passed" },
      grade: "recommended",
      narrative: {
        dimensionComments: {
          educationBackground: "学历符合要求",
          experienceRelevance: "经验能够支撑岗位职责",
          potential: "成长轨迹清晰",
          projectMatch: "项目复杂度符合预期",
          skillMatch: "核心技能匹配",
          stability: "任职经历较稳定",
        },
        overallComment: "候选人的核心能力与岗位要求较为一致。",
        summary: "候选人整体匹配。",
      },
    },
  } as ResumeLibraryDetail;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function renderHoverCard() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ResumeAiScoreHoverCardView
          dependencies={{
            fetchReview: fetchStudioResumeReviewMock,
            renderRadar: (dimensions) => (
              <div data-radar-chart data-show-tooltip="false">
                {dimensions.map((dimension) => dimension.label).join("、")}
              </div>
            ),
            slug: "demo",
          }}
          recordId="resume-1"
        >
          推荐 · 84 分
        </ResumeAiScoreHoverCardView>
      </QueryClientProvider>,
    );
  });

  return { host, root };
}

describe("ResumeAiScoreHoverCard", () => {
  it("loads and displays the six-dimension review only after opening", async () => {
    const detail = Promise.withResolvers<ResumeLibraryDetail>();
    fetchStudioResumeReviewMock.mockReturnValue(detail.promise);
    const { host, root } = renderHoverCard();

    expect(fetchStudioResumeReviewMock).not.toHaveBeenCalled();
    const trigger = host.querySelector("button");
    expect(trigger?.classList).toContain("underline");
    expect(trigger?.classList).toContain("decoration-transparent");
    expect(trigger?.classList).toContain("underline-offset-2");
    expect(trigger?.classList).toContain("hover:decoration-foreground/40");

    act(() => {
      trigger?.click();
    });

    await vi.waitFor(() => {
      expect(fetchStudioResumeReviewMock).toHaveBeenCalledWith("demo", "resume-1");
    });
    expect(getRevealState()).toBe("loading");
    expect(document.body.querySelector('[data-slot="ai-score-preview-skeleton"]')).not.toBeNull();

    await act(async () => {
      detail.resolve(createLegacyDetail());
      await detail.promise;
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("张三");
      expect(document.body.textContent).toContain("AI评分详情");
      expect(document.body.textContent).toContain("候选人与岗位高度匹配");
      expect(document.body.textContent).toContain("技能和经验与岗位要求较为一致。");
      expect(document.body.querySelectorAll("[data-ai-score-dimension]")).toHaveLength(6);
      const radarChart = document.body.querySelector<HTMLElement>("[data-radar-chart]");
      expect(radarChart?.textContent).toContain("技能匹配度");
      expect(radarChart?.dataset.showTooltip).toBe("false");
      expect(document.body.querySelector('[data-slot="ai-score-radar"]')?.classList).toContain(
        "overflow-hidden",
      );
      const dimensionList = document.body.querySelector('[data-slot="ai-score-dimension-list"]');
      expect(dimensionList?.classList).toContain("flex-col");
      expect(dimensionList?.className).not.toContain("grid-cols-2");
      expect(document.body.querySelector('[data-slot="hover-card-content"]')?.classList).toContain(
        "overflow-hidden",
      );
      const contentShell = document.body.querySelector('[data-slot="ai-score-content-shell"]');
      expect(contentShell?.className).not.toContain("p-3");
      expect(contentShell?.querySelector('[data-slot="separator"]')?.parentElement).toBe(
        contentShell,
      );
      expect(contentShell?.querySelector('[data-slot="ai-score-header"]')?.classList).toContain(
        "p-3",
      );
      expect(getRevealState()).toBe("revealed");
    });

    act(() => root.unmount());
  });

  it("uses the structured evaluation for the chart, AI comment, and dimension details", async () => {
    fetchStudioResumeReviewMock.mockResolvedValue(createStructuredDetail());
    const { host, root } = renderHoverCard();

    act(() => {
      host.querySelector("button")?.click();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("李四");
      expect(document.body.textContent).toContain("候选人的核心能力与岗位要求较为一致。");
      expect(document.body.textContent).toContain("综合评分 84 分");
      expect(document.body.querySelectorAll("[data-ai-score-dimension]")).toHaveLength(6);
      expect(document.body.textContent).toContain("权重 35%");
      expect(document.body.textContent).toContain("核心技能匹配");
    });

    act(() => root.unmount());
  });
});
