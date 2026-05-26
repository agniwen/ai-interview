"use client";

// 简历库的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { truncateText } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-detail/helpers";
import { ResumeProfileView } from "@/components/resume-profile-view";
import Markdown from "react-markdown";

export function ResumeOverviewPanel({ detail }: { detail: ResumeLibraryDetail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-background p-5">
        <h3 className="font-medium text-sm">结构化经历</h3>
        <div className="mt-4">
          <ResumeProfileView profile={detail.resumeProfile ?? null} />
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background p-5">
        <h3 className="font-medium text-sm">简历评价</h3>
        <div className="mt-3 text-muted-foreground text-sm leading-normal">
          <Markdown>{truncateText(detail.notes) || "暂无简历评价"}</Markdown>
        </div>
      </div>
    </div>
  );
}
