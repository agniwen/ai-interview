// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { ResumeReview } from "@arc/shared/resume-review";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { StudioPersonEditDialog } from "./studio-person-edit-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchStudioResume: vi.fn(),
}));

vi.mock("@/lib/client/api", () => ({
  apiFetch: apiMocks.apiFetch,
  fetchStudioInterviewRound: vi.fn(),
  fetchStudioResume: apiMocks.fetchStudioResume,
  resetStudioInterviewRound: vi.fn(),
  updateStudioInterviewRound: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/features/studio/interviews/job-description-select-field", () => ({
  JobDescriptionSelectField: () => <div data-testid="job-description-select" />,
}));

vi.mock("@/components/ui/file-upload", () => ({
  FileUpload: () => <div data-testid="file-upload" />,
}));

interface MarkdownEditorMockProps {
  disabled?: boolean;
  id?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

vi.mock("@/components/features/markdown-editor", () => ({
  MarkdownEditor: ({
    disabled,
    id,
    onBlur,
    onChange,
    placeholder,
    value,
  }: MarkdownEditorMockProps) => (
    <textarea
      aria-label="Markdown 原始内容"
      disabled={disabled}
      id={id}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

vi.mock("./use-resume-review-regeneration", () => ({
  useResumeReviewRegeneration: () => ({
    cancel: vi.fn(),
    isGenerating: false,
    regenerate: vi.fn(),
  }),
}));

const STRUCTURED_REVIEW: ResumeReview = {
  biasScan: { items: [] },
  dimensions: {
    educationBackground: { rationale: "学历背景符合预期", score: 75 },
    experienceRelevance: { rationale: "岗位相关", score: 78 },
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
    rationale: "建议面试核实",
  },
  overall: {
    baseScore: 79,
    conclusion: "候选人匹配度较高。",
    scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 79（不含历史面试加权）",
  },
  schemaVersion: 4,
  strengths: [{ evidence: "简历证据", impact: "匹配岗位", point: "经验匹配" }],
  teamPositioning: { rationale: "经历集中", suggestion: "业务团队" },
  weaknesses: [{ evidence: null, impact: "需面试确认", point: "细节不足" }],
};

function makeDetail(overrides: Partial<ResumeLibraryDetail> = {}): ResumeLibraryDetail {
  return {
    candidateEmail: null,
    candidateExpectationsMeta: null,
    candidateName: "邓超",
    candidatePhone: null,
    closedAt: null,
    closedMeta: null,
    closedReason: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    createdBy: null,
    creatorImage: null,
    creatorName: null,
    creatorOrganizationName: null,
    duplicateMatch: null,
    hasInterviewRounds: false,
    hasResumeFile: true,
    humanInterviewScheduledAt: null,
    humanInterviewerId: null,
    id: "resume-1",
    interviewQuestions: [],
    jobDescriptionDepartmentName: null,
    jobDescriptionId: "jd-1",
    jobDescriptionName: "前端工程师",
    lastInterviewAt: null,
    notes: "已有简历评价",
    offerAcceptedAt: null,
    offerSentAt: null,
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeContentHash: "hash",
    resumeEvaluationStatus: null,
    resumeFileName: "resume.pdf",
    resumeParseError: null,
    resumeParseStatus: "ready",
    resumeParsedAt: "2026-06-15T00:00:00.000Z",
    resumeProfile: null,
    resumeReview: null,
    stageProgress: {
      aiInterview: null,
      humanInterview: null,
      offer: null,
    },
    status: "draft",
    targetRole: "前端工程师",
    updatedAt: "2026-06-15T00:00:00.000Z",
    writtenTestScheduledAt: null,
    writtenTestScore: null,
    ...overrides,
  };
}

function renderDialog() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider id="org-1" memberRole="admin" slug="new">
          <StudioPersonEditDialog mode="resume" onOpenChange={vi.fn()} open recordId="resume-1" />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
  });

  return { queryClient, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StudioPersonEditDialog", () => {
  it("prefills resume review notes in resume edit mode", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue(makeDetail());
    const { queryClient, root } = renderDialog();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("已有简历评价");
    });

    expect(apiMocks.fetchStudioResume).toHaveBeenCalledWith("new", "resume-1");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("prefills editable resume fields in resume edit mode", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue({
      ...makeDetail(),
      candidateEmail: "dengchao@example.com",
      candidatePhone: "13800138000",
    });
    const { queryClient, root } = renderDialog();

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLInputElement>("#candidateName")?.value).toBe("邓超");
    });

    expect(document.querySelector<HTMLInputElement>("#candidateEmail")?.value).toBe(
      "dengchao@example.com",
    );
    expect(document.querySelector<HTMLInputElement>("#candidatePhone")?.value).toBe("13800138000");
    expect(document.querySelector<HTMLInputElement>("#targetRole")?.value).toBe("前端工程师");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("preserves structured resume review when notes are manually changed", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue(makeDetail({ resumeReview: STRUCTURED_REVIEW }));
    apiMocks.apiFetch.mockResolvedValue(makeDetail());
    const { queryClient, root } = renderDialog();

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>("#notes")?.value).toBe("已有简历评价");
    });

    const notes = document.querySelector<HTMLTextAreaElement>("#notes");
    expect(notes).not.toBeNull();

    act(() => {
      if (!notes) {
        return;
      }
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(notes, "用户改过的简历评价");
      notes.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = document.querySelector<HTMLFormElement>("#resume-edit-form");
    expect(form).not.toBeNull();

    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => {
      expect(apiMocks.apiFetch).toHaveBeenCalled();
    });

    const [, init] = apiMocks.apiFetch.mock.calls[0] as [
      string,
      { body: FormData; method: string },
    ];
    expect(init.body.has("resumeReview")).toBe(false);

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });

  it("submits the selected resume evaluation status from resume edit mode", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue(makeDetail({ resumeEvaluationStatus: "pass" }));
    apiMocks.apiFetch.mockResolvedValue(makeDetail({ resumeEvaluationStatus: "fail" }));
    const { queryClient, root } = renderDialog();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("简历评估");
    });

    const form = document.querySelector<HTMLFormElement>("#resume-edit-form");
    expect(form).not.toBeNull();

    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => {
      expect(apiMocks.apiFetch).toHaveBeenCalled();
    });

    const [, init] = apiMocks.apiFetch.mock.calls[0] as [
      string,
      { body: FormData; method: string },
    ];
    expect(init.body.get("resumeEvaluationStatus")).toBe("pass");

    act(() => {
      root.unmount();
    });
    queryClient.clear();
  });
});
