"use client";

// 简历库的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { describeResumeProgress } from "@arc/shared/studio-resumes";
import { truncateText } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-detail/helpers";
import { ResumeProfileView } from "@/components/resume-profile-view";
import { SoftPanel } from "@/components/soft-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
import { useState } from "react";
import Markdown from "react-markdown";

const SUMMARY_COLLAPSE_THRESHOLD = 180;

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function SummaryItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <SoftPanel className="min-w-0 px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate font-medium text-sm">{textOrDash(value)}</p>
    </SoftPanel>
  );
}

function ExpandableMarkdownSummary({ value }: { value: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const text = truncateText(value);
  const content = !text || text === "未填写" ? "暂无简历评价。" : text;
  const canExpand = content.length > SUMMARY_COLLAPSE_THRESHOLD;

  return (
    <div className="mt-2">
      <div
        className={cn(
          "relative text-muted-foreground text-sm leading-normal",
          !expanded && canExpand ? "max-h-20 overflow-hidden" : "",
        )}
      >
        <Markdown>{content}</Markdown>
        {!expanded && canExpand ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b from-transparent to-background" />
        ) : null}
      </div>
      {canExpand ? (
        <div className="mt-1 flex justify-center">
          <Button
            className="h-auto px-0 text-xs"
            onClick={() => setExpanded((next) => !next)}
            size="sm"
            type="button"
            variant="link"
          >
            {expanded ? "收起" : "查看全部"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ResumeOverviewPanel({ detail }: { detail: ResumeLibraryDetail }) {
  const progress = describeResumeProgress(detail);
  const skills = detail.resumeProfile?.skills.slice(0, 8) ?? [];
  const strengths = detail.resumeProfile?.personalStrengths.slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-background p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm">候选人摘要</h3>
              <Badge variant={progress.tone}>{progress.label}</Badge>
            </div>
            <ExpandableMarkdownSummary value={detail.notes} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SummaryItem label="目标岗位" value={detail.targetRole} />
          <SummaryItem label="关联岗位" value={detail.jobDescriptionName} />
          <SummaryItem label="工作年限" value={detail.resumeProfile?.workYears ?? null} />
        </div>

        {skills.length > 0 || strengths.length > 0 ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
            {skills.length > 0 ? (
              <div>
                <p className="mb-2 text-muted-foreground text-xs">核心技能</p>
                <ul className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <li
                      className="rounded-full border border-border px-2.5 py-0.5 text-xs"
                      key={skill}
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {strengths.length > 0 ? (
              <div>
                <p className="mb-2 text-muted-foreground text-xs">主要亮点</p>
                <ul className="space-y-1.5 text-sm">
                  {strengths.map((strength) => (
                    <li
                      className="line-clamp-2 text-muted-foreground leading-normal"
                      key={strength}
                    >
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-background p-5">
        <h3 className="font-medium text-sm">结构化信息</h3>
        <div className="mt-4">
          <ResumeProfileView profile={detail.resumeProfile ?? null} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background p-5">
        <h3 className="font-medium text-sm">简历评价</h3>
        <div className="mt-3 text-muted-foreground text-sm leading-normal">
          <Markdown>{truncateText(detail.notes) || "暂无简历评价"}</Markdown>
        </div>
      </div>
    </div>
  );
}
