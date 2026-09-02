// @vitest-environment jsdom

import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { GenerateResumeReviewResult } from "@/lib/client/resume-analysis";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResumeReviewRegeneration } from "../use-resume-review-regeneration";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  generateResumeReview: vi.fn(),
  generateResumeReviewMarkdownFirst: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

interface CapturedAbortSignal {
  signal: AbortSignal | null;
}

const resumeProfile: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: "未发现信息",
  name: "郭靖",
  personalStrengths: ["沟通清晰"],
  phone: "13800138000",
  projectExperiences: [],
  schools: ["江南大学"],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

type HookValue = ReturnType<typeof useResumeReviewRegeneration>;

function renderHookHarness(callbacks: {
  onDraftChange: (review: string) => void;
  onGenerated: (result: GenerateResumeReviewResult) => void;
}) {
  const dependencies = {
    generateResumeReviewMarkdownFirst: mocks.generateResumeReviewMarkdownFirst,
    toast: { error: mocks.toastError, success: mocks.toastSuccess },
  };
  let current: HookValue | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    current = useResumeReviewRegeneration(callbacks, dependencies);
    return null;
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider
          id="org-test"
          memberRole="admin"
          permissions={{}}
          slug="workspace-test"
        >
          <Harness />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
  });

  if (!current) {
    throw new Error("Hook did not render");
  }

  return {
    get current() {
      if (!current) {
        throw new Error("Hook is not mounted");
      }
      return current;
    },
    root,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useResumeReviewRegeneration", () => {
  it("streams draft updates and commits the generated review", async () => {
    const onDraftChange = vi.fn();
    const onGenerated = vi.fn();
    const result = {
      review: "最终评价",
      structuredReview: {
        biasScan: { items: [] },
        dimensions: {
          educationBackground: { rationale: "学历背景符合预期", score: 75 },
          experienceRelevance: { rationale: "相关", score: 78 },
          potential: { rationale: "潜力良好", score: 80 },
          projectMatch: { rationale: "项目匹配", score: 80 },
          skillMatch: { rationale: "技能匹配", score: 80 },
          stability: { rationale: "稳定性可接受", score: 75 },
        },
        levelRecommendation: { level: "中级", rationale: "经验匹配" },
        nextStep: {
          action: "interview",
          disclaimer: "以上为初步结论",
          interviewFocus: ["项目贡献"],
          rationale: "建议面试",
        },
        overall: {
          baseScore: 79,
          conclusion: "候选人匹配。",
          scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 79（不含历史面试加权）",
        },
        schemaVersion: 4,
        strengths: [{ evidence: "简历证据", impact: "匹配岗位", point: "经验匹配" }],
        teamPositioning: { rationale: "经历集中", suggestion: "业务团队" },
        weaknesses: [{ evidence: null, impact: "需核实", point: "细节不足" }],
      },
    } satisfies GenerateResumeReviewResult;
    mocks.generateResumeReviewMarkdownFirst.mockImplementationOnce(({ onDraftChange: onDraft }) => {
      onDraft("草稿评价");
      return result;
    });

    const harness = renderHookHarness({ onDraftChange, onGenerated });

    await act(async () => {
      await harness.current.regenerate({
        jobDescriptionId: "jd_1",
        resumeProfile,
      });
    });

    expect(mocks.generateResumeReviewMarkdownFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescriptionId: "jd_1",
        resumeProfile,
      }),
    );
    expect(mocks.generateResumeReview).not.toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledWith("草稿评价");
    expect(onGenerated).toHaveBeenCalledWith(result);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("已重新生成简历评价");

    act(() => {
      harness.root.unmount();
    });
  });

  it("exposes workflow progress and preview events while regenerating review", async () => {
    const onDraftChange = vi.fn();
    const onGenerated = vi.fn();
    const result = {
      review: "最终评价",
      structuredReview: {
        biasScan: { items: [] },
        dimensions: {
          educationBackground: { rationale: "学历背景符合预期", score: 75 },
          experienceRelevance: { rationale: "相关", score: 78 },
          potential: { rationale: "潜力良好", score: 80 },
          projectMatch: { rationale: "项目匹配", score: 80 },
          skillMatch: { rationale: "技能匹配", score: 80 },
          stability: { rationale: "稳定性可接受", score: 75 },
        },
        levelRecommendation: { level: "中级", rationale: "经验匹配" },
        nextStep: {
          action: "interview",
          disclaimer: "以上为初步结论",
          interviewFocus: ["项目贡献"],
          rationale: "建议面试",
        },
        overall: {
          baseScore: 79,
          conclusion: "候选人匹配。",
          scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 79（不含历史面试加权）",
        },
        schemaVersion: 4,
        strengths: [{ evidence: "简历证据", impact: "匹配岗位", point: "经验匹配" }],
        teamPositioning: { rationale: "经历集中", suggestion: "业务团队" },
        weaknesses: [{ evidence: null, impact: "需核实", point: "细节不足" }],
      },
    } satisfies GenerateResumeReviewResult;
    mocks.generateResumeReviewMarkdownFirst.mockImplementationOnce(
      ({ onDraftChange: onDraft, onEvent }) => {
        onEvent?.({
          label: "生成维度评分",
          runId: "run-1",
          stepId: "scoring",
          type: "step.started",
        });
        onEvent?.({
          artifactType: "resume.review.scoring",
          data: { baseScore: 79 },
          runId: "run-1",
          stepId: "scoring",
          type: "step.preview",
        });
        onEvent?.({
          runId: "run-1",
          stepId: "scoring",
          type: "step.completed",
        });
        onEvent?.({
          runId: "run-1",
          stepId: "compose-review",
          text: "最终评价",
          type: "step.delta",
        });
        onDraft?.("最终评价");
        return result;
      },
    );

    const harness = renderHookHarness({ onDraftChange, onGenerated });

    await act(async () => {
      await harness.current.regenerate({
        jobDescriptionId: "jd_1",
        resumeProfile,
      });
    });

    expect(harness.current.progressTools).toContainEqual({
      done: true,
      name: "生成维度评分",
    });
    expect(harness.current.progressStatus).toBe("");
    expect(harness.current.scoringPreview).toEqual({ baseScore: 79 });
    expect(onDraftChange).toHaveBeenCalledWith("最终评价");

    act(() => {
      harness.root.unmount();
    });
  });

  it("aborts in-flight generation when cancelled", async () => {
    const onDraftChange = vi.fn();
    const onGenerated = vi.fn();
    const captured: CapturedAbortSignal = { signal: null };
    const abortDeferred = Promise.withResolvers<null>();
    mocks.generateResumeReviewMarkdownFirst.mockImplementationOnce(({ signal }) => {
      captured.signal = signal ?? null;
      signal?.addEventListener("abort", () => abortDeferred.resolve(null), { once: true });
      return abortDeferred.promise;
    });

    const harness = renderHookHarness({ onDraftChange, onGenerated });
    let generation: Promise<void>;

    act(() => {
      generation = harness.current.regenerate({
        jobDescriptionId: "jd_1",
        resumeProfile,
      });
    });

    await act(async () => {
      harness.current.cancel();
      await generation;
    });

    if (!captured.signal) {
      throw new Error("Expected generation signal to be captured");
    }
    expect(captured.signal.aborted).toBe(true);
    expect(onGenerated).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    act(() => {
      harness.root.unmount();
    });
  });
});
