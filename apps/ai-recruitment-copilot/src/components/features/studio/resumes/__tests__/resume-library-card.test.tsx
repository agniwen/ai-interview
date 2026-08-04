import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@arc/shared/studio-resumes";
import { ResumeLibraryCard } from "../resume-library-card";

const record: ResumeLibraryListRecord = {
  candidateEmail: null,
  candidateName: "测试候选人",
  candidatePhone: null,
  createdAt: "2026-08-04T00:00:00.000Z",
  createdBy: null,
  creatorImage: null,
  creatorName: null,
  duplicateMatch: null,
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
  it("shows the composite score when the candidate did not pass a gate", () => {
    const noop = vi.fn();
    const content = renderToStaticMarkup(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
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

  it("keeps showing a labeled legacy score after the job upgrades", () => {
    const noop = vi.fn();
    const content = renderToStaticMarkup(
      <ResumeLibraryCard
        canCreateInterview={false}
        canDeleteResumeLibrary={false}
        canRetryResumeParse={false}
        canUpdateResumeLibrary={false}
        currentMemberRole="viewer"
        currentUserId={null}
        onCopyDetailLink={noop}
        onDelete={noop}
        onEdit={noop}
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
      const content = renderToStaticMarkup(
        <ResumeLibraryCard
          canCreateInterview={false}
          canDeleteResumeLibrary={false}
          canRetryResumeParse={false}
          canUpdateResumeLibrary={false}
          currentMemberRole="viewer"
          currentUserId={null}
          onCopyDetailLink={noop}
          onDelete={noop}
          onEdit={noop}
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
