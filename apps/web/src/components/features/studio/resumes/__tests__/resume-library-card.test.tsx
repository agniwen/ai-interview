import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@app/shared/studio-resumes";
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
  nodeResult: null,
  nodeStatus: "pending",
  notes: null,
  outcome: "in_pipeline",
  pipelineStage: "screening",
  qualitativeRecommendationLevel: null,
  qualitativeResumeSummary: null,
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
  version: 0,
};

describe("ResumeLibraryCard", () => {
  it.each([null, "fail", "pass"] as const)(
    "only exposes AI launch after manual screening passes (%s)",
    (resumeEvaluationStatus) => {
      const noop = vi.fn();
      const content = renderWithQueryClient(
        <ResumeLibraryCard
          canCreateInterview
          canDeleteResumeLibrary={false}
          canForceReparse={false}
          canRetryResumeParse={false}
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
          record={{
            ...record,
            hasInterviewRounds: false,
            pipelineStage: "screening",
            resumeEvaluationStatus,
            resumeParseStatus: "ready",
          }}
          retrying={false}
          selected={false}
        />,
      );
      expect(content.includes(">AI面</span>")).toBe(resumeEvaluationStatus === "pass");
    },
  );

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

  it.each(["development", "production", "test"])(
    "does not show HR badges in any environment (%s)",
    (environment) => {
      vi.stubEnv("NODE_ENV", environment);
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
            duplicateMatch: { count: 2, highestLevel: "high" },
            stageProgress: {
              ...record.stageProgress,
              initialInterview: {
                latestStatus: "ready",
                latestVersionId: "initial-version-1",
                totalSnapshots: 1,
              },
            },
          }}
          retrying={false}
          selected={false}
        />,
      );

      expect(content).toContain("人工初面 · 已生成");
      expect(content).not.toContain("HR处理");
      vi.unstubAllEnvs();
      expect(content.indexOf("简历筛选")).toBeLessThan(content.indexOf("重复简历 2 条"));
    },
  );

  it("shows the hired outcome instead of pending advancement after onboarding", () => {
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
          nodeResult: "pass",
          nodeStatus: "completed",
          outcome: "hired",
          pipelineStage: "closed",
        }}
        retrying={false}
        selected={false}
      />,
    );

    expect(content).toContain("已入职");
    expect(content).not.toContain("已通过待推进");
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

    expect(content).toContain('title="未通过门槛 · 68 分 AI 生成的候选人评价"');
    expect(content).not.toContain("</button> · AI 生成的候选人评价");
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
