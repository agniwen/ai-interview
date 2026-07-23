"use client";

import { IconChevronRight, IconSparkles } from "@tabler/icons-react";
import {
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
} from "@arc/shared/resume-review";
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecruitingCopilotContext } from "./recruiting-copilot-context";
import type { ResumeRecordDetailResult } from "./recruiting-copilot-context";

interface RecruitingResumeReviewDimension {
  key: string;
  label: string;
  score: number | null;
}

export function buildRecruitingResumeReviewCardModel(
  review: ResumeReviewLoose | null | undefined,
): {
  baseScore: number | null;
  conclusion: string | null;
  dimensions: RecruitingResumeReviewDimension[];
} {
  return {
    baseScore: review ? getResumeReviewBaseScore(review) : null,
    conclusion: review?.overall.conclusion ?? null,
    dimensions: RESUME_REVIEW_DIMENSIONS.map((definition) => {
      const dimension = review ? getResumeReviewDimension(review, definition.key) : null;
      return {
        key: definition.key,
        label: definition.label,
        score: dimension?.score ?? null,
      };
    }),
  };
}

function DimensionScore({ dimension }: { dimension: RecruitingResumeReviewDimension }) {
  const { score } = dimension;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-muted-foreground text-xs">{dimension.label}</span>
        <span className="shrink-0 font-medium text-xs tabular-nums">
          {score === null ? "—" : score}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <meter
          aria-label={`${dimension.label}${score === null ? "未评分" : `${score} 分`}`}
          className="sr-only"
          max={100}
          min={0}
          value={score ?? 0}
        />
        <div
          aria-hidden="true"
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            score === null ? "bg-muted" : "bg-primary/75",
          )}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function RecruitingResumeReviewCard({
  record,
}: {
  record: NonNullable<ResumeRecordDetailResult["resumeRecord"]>;
}) {
  const { openResumeDetail } = useRecruitingCopilotContext();
  const model = buildRecruitingResumeReviewCardModel(record.resumeReview);

  return (
    <section
      aria-label={`${record.candidateName} 的数据库 AI评分`}
      className="aui-resume-review-card overflow-hidden rounded-2xl border bg-background shadow-xs"
    >
      <div className="flex items-start justify-between gap-4 border-b bg-muted/25 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground shadow-xs">
            <IconSparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate font-medium text-sm">{record.candidateName}</h3>
              <span className="rounded-full border bg-background px-2 py-0.5 text-muted-foreground text-[11px]">
                数据库 AI评分
              </span>
            </div>
            <p className="mt-1 truncate text-muted-foreground text-xs">
              关联岗位：{record.jobDescriptionName ?? "已绑定岗位"}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold text-2xl tabular-nums leading-none">
            {model.baseScore ?? "—"}
          </div>
          <div className="mt-1 text-muted-foreground text-[11px]">综合评分 / 100</div>
        </div>
      </div>

      <div className="px-4 py-3.5">
        <p className="mb-3 text-sm leading-6">
          {model.conclusion ?? "该候选人尚未生成 AI评分，六维评分暂无数据。"}
        </p>
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          {model.dimensions.map((dimension) => (
            <DimensionScore dimension={dimension} key={dimension.key} />
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t bg-muted/15 px-2 py-1.5">
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => openResumeDetail(record.id, "ai-analysis")}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconSparkles className="size-3.5" />
          AI评分详情
          <IconChevronRight className="size-3.5 text-muted-foreground" />
        </Button>
      </div>
    </section>
  );
}
