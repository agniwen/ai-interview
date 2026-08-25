import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@arc/shared/studio-resumes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ResumeLibraryCard } from "../resume-library-card";

function renderWithQueryClient(element: ReactElement) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>,
  );
}

const record: ResumeLibraryListRecord = {
  candidateEmail: null,
  candidateName: "测试候选人",
  candidatePhone: null,
  createdAt: "2026-08-04T00:00:00.000Z",
  createdBy: null,
  creatorImage: null,
  creatorName: null,
  duplicateMatch: null,
  feishuDocumentUrl: null,
  hasInterviewRounds: false,
  hasResumeFile: false,
  id: "resume-1",
  jobDescriptionDepartmentName: null,
  jobDescriptionId: null,
  jobDescriptionName: null,
  jobEvaluationMode: "structured",
  lastInterviewAt: null,
  notes: null,
  outcome: "in_pipeline",
  pipelineStage: "screening",
  resumeEvaluationArtifactMode: "structured",
  resumeEvaluationAttemptMode: "structured",
  resumeEvaluationStatus: null,
  resumeFileName: null,
  resumeParseRetryable: false,
  resumeParseStatus: "ready",
  resumeProfileSnapshot: EMPTY_RESUME_PROFILE_SNAPSHOT,
  resumeReviewBaseScore: null,
  resumeReviewError: null,
  resumeReviewGeneratedAt: null,
  resumeReviewNextStepAction: null,
  resumeReviewQueuedAt: null,
  resumeReviewRunId: null,
  resumeReviewStatus: "ready",
  resumeSkills: [],
  resumeSummary: null,
  stageProgress: {
    aiInterview: null,
    humanInterview: null,
    offer: null,
  },
  structuredCompositeScore: 68,
  structuredGateSortRank: 2,
  structuredGateStatus: "failed",
  structuredScoreGrade: "unmatched",
  targetRole: null,
  updatedAt: "2026-08-04T00:00:00.000Z",
};

describe("ResumeLibraryCard", () => {
  it("shows reparse for every failed record regardless of legacy retry eligibility", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse
        canUpdateResumeLibrary
        currentMemberRole="member"
        currentUserId="user-1"
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={{ ...record, resumeParseRetryable: false, resumeParseStatus: "failed" }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toContain(">重新解析</span>");
  });

  it("shows the candidate evaluation form action only when a Feishu document exists", () => {
    const noop = vi.fn();
    const renderCard = (feishuDocumentUrl: string | null) =>
      renderWithQueryClient(
        <ResumeLibraryCard
          canCreateInterview={false}
          canDeleteResumeLibrary={false}
          canForceReparse={false}
          canRetryResumeParse={false}
          canUpdateResumeLibrary={false}
          currentMemberRole="viewer"
          currentUserId={null}
          onCopyDetailLink={noop}
          onDelete={noop}
          onEdit={noop}
          onForceReparse={noop}
          onLaunchInterview={noop}
          onOpenDetail={noop}
          onPreviewResume={noop}
          onRetryParse={noop}
          onSelectChange={noop}
          onShowDuplicateMatches={noop}
          onTransition={noop}
          record={{ ...record, feishuDocumentUrl }}
          retrying={false}
          selected={false}
        />,
      );

    expect(renderCard(null)).not.toContain(">评价表<");
    const withDocument = renderCard("https://example.feishu.cn/docx/candidate");
    expect(withDocument).toContain(">评价表<");
    expect(withDocument).toContain('href="https://example.feishu.cn/docx/candidate"');
  });

  it("shows the composite score when the candidate did not pass a gate", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={record}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toContain("未通过门槛 · 68 分");
  });

  it("places the duplicate badge immediately after the lifecycle badge", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={{ ...record, duplicateMatch: { count: 2, highestLevel: "high" } }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content.indexOf("简历筛选")).toBeLessThan(content.indexOf("重复简历 2 条"));
  });

  it("places the AI score inside the generated summary paragraph", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={{ ...record, resumeSummary: "AI 生成的候选人评价" }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toMatch(
      /<p class="[^"]*text-\[13px\][^"]*"[^>]*>.*未通过门槛 · 68 分.*AI 生成的候选人评价<\/p>/,
    );
    expect(content).toContain('title="未通过门槛 · 68 分 AI 生成的候选人评价"');
    expect(content).not.toContain("</button> · AI 生成的候选人评价");
    expect(content).not.toContain('<span class="sr-only">AI评分</span>');
  });

  it("uses a compact profile hover trigger below the largest breakpoint", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={{
          ...record,
          resumeProfileSnapshot: {
            ...EMPTY_RESUME_PROFILE_SNAPSHOT,
            education: [{ period: "2016–2020", primary: "浙江大学", secondary: "计算机科学" }],
            work: [{ period: "2021–至今", primary: "字节跳动", secondary: "高级前端工程师" }],
          },
          resumeSkills: ["增长实验", "用户分层", "激励机制", "生命周期运营", "Discord", "Mod 管理"],
        }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toContain('aria-label="更多工作与教育经历"');
    expect(content).toContain(">更多</span>");
    expect(content).toContain("xl:hidden");
    expect(content).toContain("xl:block");
    expect(content).toContain("xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)]");
    expect(content).not.toContain("2xl:hidden");
    expect(content).toContain("line-clamp-3");
    expect(content).toContain("text-[13px]");
    expect(content).toContain("leading-[19px]");
    expect(content).toContain("flex-nowrap");
    expect(content).toContain(
      "[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]",
    );
    expect(content).not.toContain("flex-wrap gap-1.5 overflow-hidden");
    expect(content).toContain("字节跳动");
    expect(content).toContain("浙江大学");
  });

  it("keeps showing a labeled legacy score after the job upgrades", () => {
    const noop = vi.fn();
    const content = renderWithQueryClient(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canForceReparse={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
        onForceReparse={noop}
        onLaunchInterview={noop}
        onOpenDetail={noop}
        onPreviewResume={noop}
        onRetryParse={noop}
        onSelectChange={noop}
        onShowDuplicateMatches={noop}
        onTransition={noop}
        record={{
          ...record,
          resumeEvaluationArtifactMode: "legacy",
          resumeEvaluationAttemptMode: null,
          resumeReviewBaseScore: 82,
          resumeReviewNextStepAction: "interview",
          structuredCompositeScore: null,
          structuredGateSortRank: null,
          structuredGateStatus: null,
          structuredScoreGrade: null,
        }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toContain("老版本结果 · 建议进入面试（82分）");
  });

  it.each([
    ["queued", "新版重评中"],
    ["processing", "新版重评中"],
    ["failed", "新版重评失败"],
  ] as const)(
    "keeps the legacy score visible while a structured replacement is %s",
    (resumeReviewStatus, replacementStatusLabel) => {
      const noop = vi.fn();
      const content = renderWithQueryClient(
        <ResumeLibraryCard
          canCreateInterview={false}
          canDeleteResumeLibrary={false}
          canForceReparse={false}
          canRetryResumeParse={false}
          canUpdateResumeLibrary={false}
          currentMemberRole="viewer"
          currentUserId={null}
          onCopyDetailLink={noop}
          onDelete={noop}
          onEdit={noop}
          onForceReparse={noop}
          onLaunchInterview={noop}
          onOpenDetail={noop}
          onPreviewResume={noop}
          onRetryParse={noop}
          onSelectChange={noop}
          onShowDuplicateMatches={noop}
          onTransition={noop}
          record={{
            ...record,
            resumeEvaluationArtifactMode: "legacy",
            resumeEvaluationAttemptMode: "structured",
            resumeReviewBaseScore: 82,
            resumeReviewNextStepAction: "interview",
            resumeReviewStatus,
            structuredCompositeScore: null,
            structuredGateSortRank: null,
            structuredGateStatus: null,
            structuredScoreGrade: null,
          }}
          retrying={false}
          selected={false}
        />,
      );

      expect(content).toContain("老版本结果 · 建议进入面试（82分）");
      expect(content).toContain(replacementStatusLabel);
    },
  );
});
