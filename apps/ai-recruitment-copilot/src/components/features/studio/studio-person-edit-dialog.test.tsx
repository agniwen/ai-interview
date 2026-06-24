// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
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

vi.mock("./use-resume-review-regeneration", () => ({
  useResumeReviewRegeneration: () => ({
    cancel: vi.fn(),
    isGenerating: false,
    regenerate: vi.fn(),
  }),
}));

function makeDetail(): ResumeLibraryDetail {
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
});
