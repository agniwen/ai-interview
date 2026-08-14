import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResumeDedupCompareDialog } from "./resume-dedup-compare-dialog";

const queryState = vi.hoisted(() => ({
  calls: 0,
}));

const details = [
  {
    candidateEmail: null,
    candidateName: "当前候选人",
    candidatePhone: null,
    createdAt: "2026-07-24T08:00:00.000Z",
    id: "current-id",
    jobDescriptionName: null,
    pipelineStatus: { label: "AI 面试 · 第 2/2 轮 · 进行中", tone: "warning" },
    resumeFileName: "current.pdf",
    resumeProfile: null,
    sourceLabel: "招聘台",
    sourceType: "studio_interview",
    statusLabel: "流程中",
    targetRole: null,
    uploaderImage: "https://example.com/current.png",
    uploaderName: "当前上传人",
  },
  {
    candidateEmail: null,
    candidateName: "疑似候选人",
    candidatePhone: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    id: "match-id",
    jobDescriptionName: null,
    resumeFileName: "match.pdf",
    resumeProfile: null,
    sourceLabel: "人才库",
    sourceType: "resume_pool_item",
    statusLabel: "有效",
    targetRole: null,
    uploaderImage: "https://example.com/match.png",
    uploaderName: "疑似上传人",
  },
] as const;

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => {
    const detail = details[queryState.calls % details.length];
    queryState.calls += 1;
    return {
      data: detail,
      isError: false,
      isLoading: false,
    };
  },
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

vi.mock("@/lib/client/api", () => ({
  fetchResumePoolItemReview: vi.fn(),
  fetchStudioResumeReview: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/pdf-viewer", () => ({
  PDFViewer: () => <div>PDF preview</div>,
}));

vi.mock("@/components/ui/docx-viewer", () => ({
  DocxViewerPreview: () => <div>DOCX preview</div>,
}));

vi.mock("@/components/ui/xlsx-viewer", () => ({
  XlsxViewerPreview: () => <div>XLSX preview</div>,
}));

vi.mock("@/components/features/resume/resume-profile-view", () => ({
  ResumeProfileView: () => <div>Profile</div>,
}));

vi.mock("./resume-document-preview-dialog", () => ({
  ImageResumePreviewContent: () => <div>Image preview</div>,
}));

function renderComparison(mode: "detail" | "resume") {
  queryState.calls = 0;
  return renderToStaticMarkup(
    <ResumeDedupCompareDialog
      match={{
        candidateEmail: null,
        candidateName: "疑似候选人",
        candidatePhone: null,
        createdAt: "2026-07-25T08:00:00.000Z",
        id: "match-id",
        jobDescriptionName: null,
        resumeFileName: "match.pdf",
        sourceType: "resume_pool_item",
        status: "active",
        targetRole: null,
      }}
      mode={mode}
      onOpenChange={() => {}}
      open
      source={{
        candidateEmail: null,
        candidateName: "当前候选人",
        candidatePhone: null,
        createdAt: "2026-07-24T08:00:00.000Z",
        id: "current-id",
        jobDescriptionName: null,
        resumeFileName: "current.pdf",
        resumeProfileSnapshot: null,
        skills: [],
        sourceType: "studio_interview",
        targetRole: null,
      }}
    />,
  );
}

describe("ResumeDedupCompareDialog", () => {
  it.each(["detail", "resume"] as const)(
    "shows uploader and upload time for both sides in %s mode",
    (mode) => {
      const markup = renderComparison(mode);

      expect(markup).toContain("当前上传人");
      expect(markup).toContain("疑似上传人");
      expect(markup.match(/上传人：/g)).toHaveLength(2);
      expect(markup.match(/上传时间：/g)).toHaveLength(2);
      expect(markup.match(/data-slot="avatar"/g)).toHaveLength(2);
      expect(markup).toContain("size-5");
    },
  );

  it.each(["detail", "resume"] as const)(
    "annotates the suspected resume's creation time relative to the current one in %s mode",
    (mode) => {
      // source query (call #1) = 2026-07-24, match query (call #2) = 2026-07-25 → later.
      const markup = renderComparison(mode);

      expect(markup).toContain("比当前简历加入晚");
      expect(markup).toContain("text-green-600");
    },
  );

  it("shows the current recruiting status badge for library records in detail mode", () => {
    // The source column (call #1) is a studio_interview record with a pipeline status.
    const markup = renderComparison("detail");

    expect(markup).toContain("AI 面试 · 第 2/2 轮 · 进行中");
    expect(markup).toContain("text-amber-700");
  });
});
