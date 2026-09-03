"use client";

// 招聘台的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { ResumeOverviewAiScoreSection } from "./resume-overview-ai-score-section";
import { ResumeOverviewCandidateInfoSection } from "./resume-overview-candidate-info-section";

export { ResumeReviewStructuredView } from "./resume-review-structured-view";

export function ResumeOverviewPanel({
  canEdit = false,
  detail,
  onUpdated,
  onViewAiScore,
  slug,
}: {
  canEdit?: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  onViewAiScore?: () => void;
  slug?: string;
}) {
  return (
    <div className="space-y-8">
      <ResumeOverviewAiScoreSection detail={detail} onViewAiScore={onViewAiScore} />

      <ResumeOverviewCandidateInfoSection
        canEdit={canEdit}
        detail={detail}
        onUpdated={onUpdated}
        slug={slug}
      />

      <section className="border-t border-border/50 pt-6">
        <ResumeProfileView
          profile={detail.resumeProfile ?? null}
          showBasicInfo={false}
          showTargetRoles={false}
        />
      </section>
    </div>
  );
}
