"use client";

// 简历库的「概览」面板：候选人基本信息 + 简历评价。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — candidate basic info + notes. Shared between
// the resume-mode detail dialog and the launch-interview dialog so the same
// data renders the same way in both places.

import { CandidateBasicInfoView } from "@/components/candidate-basic-info-view";
import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { truncateText } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-detail/helpers";

export function ResumeOverviewPanel({ detail }: { detail: ResumeLibraryDetail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
        <h3 className="font-medium text-sm">候选人信息</h3>
        <div className="mt-4">
          <CandidateBasicInfoView
            candidateEmail={detail.candidateEmail}
            candidateName={detail.candidateName}
            candidatePhone={detail.candidatePhone}
            creatorName={detail.creatorName}
            hasResumeFile={detail.hasResumeFile}
            jobDescriptionName={detail.jobDescriptionName}
            resumeFileName={detail.resumeFileName}
            targetRole={detail.targetRole}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background p-5">
        <h3 className="font-medium text-sm">简历评价</h3>
        <p className="mt-3 text-muted-foreground text-sm leading-normal">
          {truncateText(detail.notes, 600) || "暂无简历评价"}
        </p>
      </div>
    </div>
  );
}
