// @vitest-environment jsdom

import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { StudioPersonEditDialog } from "../studio-person-edit-dialog";

enableReactActEnvironment();

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchStudioInterviewRound: vi.fn(),
  fetchStudioResume: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const reviewRegenerationMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  hookValue: {
    isGenerating: false,
    progressStatus: "",
    progressTools: [] as { done: boolean; name: string }[],
    regenerate: vi.fn(),
    scoringPreview: null as unknown,
  },
}));

vi.mock("@/lib/client/api", () => ({
  apiFetch: apiMocks.apiFetch,
  fetchStudioInterviewRound: apiMocks.fetchStudioInterviewRound,
  fetchStudioResume: apiMocks.fetchStudioResume,
  resetStudioInterviewRound: vi.fn(),
  updateStudioInterviewRound: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMocks.navigate,
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

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    id,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      aria-checked={checked}
      aria-label="切换"
      disabled={disabled}
      id={id}
      onClick={() => onCheckedChange?.(!checked)}
      role="switch"
      type="button"
    />
  ),
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

vi.mock("../use-resume-review-regeneration", () => ({
  useResumeReviewRegeneration: () => ({
    cancel: reviewRegenerationMocks.cancel,
    ...reviewRegenerationMocks.hookValue,
  }),
}));

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
    hrResumeAssessment: null,
    hrResumeAssessmentUpdatedAt: null,
    hrResumeAssessmentUpdatedBy: null,
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
    resumeParseRetryable: false,
    resumeParseStatus: "ready",
    resumeParsedAt: "2026-06-15T00:00:00.000Z",
    resumeProfile: null,
    resumeProfileSnapshot: {
      education: [],
      educationHasMore: false,
      projects: [],
      projectsHasMore: false,
      work: [],
      workHasMore: false,
    },
    resumeReview: null,
    resumeReviewBaseScore: null,
    resumeReviewError: null,
    resumeReviewGeneratedAt: null,
    resumeReviewNextStepAction: null,
    resumeReviewQueuedAt: null,
    resumeReviewStatus: "idle",
    resumeScreeningError: null,
    resumeScreeningEvaluatedAt: null,
    resumeScreeningResult: null,
    resumeScreeningStale: false,
    resumeScreeningStatus: "idle",
    resumeSkills: [],
    resumeSummary: null,
    stageProgress: {
      aiInterview: null,
      humanInterview: null,
      offer: null,
    },
    targetRole: "前端工程师",
    updatedAt: "2026-06-15T00:00:00.000Z",
    writtenTestScheduledAt: null,
    writtenTestScore: null,
    ...overrides,
  };
}

function makeRoundDetail(
  overrides: Partial<StudioInterviewRoundDetail> = {},
): StudioInterviewRoundDetail {
  return {
    allowTextInput: true,
    candidate: {
      candidateEmail: "candidate@example.com",
      candidateName: "候选人",
      candidatePhone: "13800138000",
      createdAt: "2026-06-15T00:00:00.000Z",
      createdBy: null,
      creatorName: null,
      creatorOrganizationName: null,
      id: "resume-1",
      interviewQuestions: [],
      jobDescriptionId: "jd-1",
      jobDescriptionName: "前端工程师",
      notes: "候选人备注",
      outcome: "in_pipeline",
      pipelineStage: "ai_interview",
      resumeContentHash: "hash",
      resumeFileName: "resume.pdf",
      resumeProfile: null,
      resumeStorageKey: "resume.pdf",
      targetRole: "前端工程师",
      updatedAt: "2026-06-15T00:00:00.000Z",
    },
    candidateFeedback: null,
    conversationId: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    disconnectedAt: null,
    hasReport: false,
    id: "round-1",
    interviewLink: "/interview/round-1",
    jdRequiredSkills: [],
    notes: "轮次备注",
    roundLabel: "第一轮",
    scheduledAt: null,
    scheduledEndAt: null,
    sessionStartedAt: null,
    sortOrder: 1,
    status: "pending",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

async function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const { root } = await renderInAct(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSlugProvider id="org-1" memberRole="admin" permissions={{}} slug="new">
        <StudioPersonEditDialog mode="resume" onOpenChange={vi.fn()} open recordId="resume-1" />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );

  return { queryClient, root };
}

async function renderInterviewDialog({
  onEditResumeRecord,
  onOpenChange = vi.fn(),
}: {
  onEditResumeRecord?: (recordId: string) => void;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const { root } = await renderInAct(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSlugProvider id="org-1" memberRole="admin" permissions={{}} slug="new">
        <StudioPersonEditDialog
          mode="interview"
          onEditResumeRecord={onEditResumeRecord}
          onOpenChange={onOpenChange}
          open
          recordId="round-1"
        />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );

  return { queryClient, root };
}

async function cleanupDialog(
  root: Awaited<ReturnType<typeof renderInAct>>["root"],
  queryClient: QueryClient,
) {
  await unmountInAct(root);
  queryClient.clear();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  reviewRegenerationMocks.hookValue = {
    isGenerating: false,
    progressStatus: "",
    progressTools: [],
    regenerate: vi.fn(),
    scoringPreview: null,
  };
});

describe("StudioPersonEditDialog", () => {
  it("opens candidate profile editing inline from interview edit mode", async () => {
    apiMocks.fetchStudioInterviewRound.mockResolvedValue(makeRoundDetail());
    const onEditResumeRecord = vi.fn();
    const onOpenChange = vi.fn();
    const { queryClient, root } = await renderInterviewDialog({
      onEditResumeRecord,
      onOpenChange,
    });

    await waitForUi(() => {
      expect(document.body.textContent).toContain("编辑候选人资料");
    });

    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("编辑候选人资料"),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onEditResumeRecord).toHaveBeenCalledWith("resume-1");
    expect(routerMocks.navigate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await cleanupDialog(root, queryClient);
  });

  it("shows reset in interview edit mode before the round is completed", async () => {
    apiMocks.fetchStudioInterviewRound.mockResolvedValue(
      makeRoundDetail({
        status: "in_progress",
      }),
    );
    const { queryClient, root } = await renderInterviewDialog();

    await waitForUi(() => {
      expect(document.body.textContent).toContain("重置面试");
    });

    await cleanupDialog(root, queryClient);
  });

  it("prefills editable resume fields in resume edit mode", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue({
      ...makeDetail(),
      candidateEmail: "dengchao@example.com",
      candidatePhone: "13800138000",
    });
    const { queryClient, root } = await renderDialog();

    await waitForUi(() => {
      expect(document.querySelector<HTMLInputElement>("#candidateName")?.value).toBe("邓超");
    });

    expect(document.querySelector<HTMLInputElement>("#candidateEmail")?.value).toBe(
      "dengchao@example.com",
    );
    expect(document.querySelector<HTMLInputElement>("#candidatePhone")?.value).toBe("13800138000");
    expect(document.querySelector<HTMLInputElement>("#targetRole")?.value).toBe("前端工程师");
    expect(document.body.textContent).not.toContain("系统简历评价");
    expect(document.body.textContent).not.toContain("简历文件");

    await cleanupDialog(root, queryClient);
  });

  it("submits identity fields without resume file or system notes", async () => {
    apiMocks.fetchStudioResume.mockResolvedValue(makeDetail({ resumeEvaluationStatus: "pass" }));
    apiMocks.apiFetch.mockResolvedValue(makeDetail({ resumeEvaluationStatus: "fail" }));
    const { queryClient, root } = await renderDialog();

    await waitForUi(() => {
      expect(document.body.textContent).toContain("简历评估");
    });

    const form = document.querySelector<HTMLFormElement>("#resume-edit-form");
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    await waitForUi(() => {
      expect(apiMocks.apiFetch).toHaveBeenCalled();
    });

    const [, init] = apiMocks.apiFetch.mock.calls[0] as [
      string,
      { body: FormData; method: string },
    ];
    expect(init.body.get("resumeEvaluationStatus")).toBe("pass");
    expect(init.body.has("notes")).toBe(false);
    expect(init.body.has("resume")).toBe(false);
    expect(init.body.has("resumeReview")).toBe(false);

    await cleanupDialog(root, queryClient);
  });
});
