"use client";

import {
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
} from "@arc/shared/resume-review";
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import { Button } from "@/components/ui/button";
import { CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { RecruitingChatCard } from "./recruiting-chat-card";
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

function ReviewDimensionRadar({ dimensions }: { dimensions: RecruitingResumeReviewDimension[] }) {
  const hasScores = dimensions.some((dimension) => dimension.score !== null);

  if (!hasScores) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
        暂无维度评分
      </div>
    );
  }

  return (
    <DimensionRadarChart
      ariaLabel="简历评分雷达图"
      className="min-h-48 max-w-52"
      compact
      dimensions={dimensions}
      tooltipBody={(dimension) => (
        <div className="font-medium text-foreground">
          {dimension.label}：{String(dimension.score ?? "—")}
        </div>
      )}
    />
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
    <RecruitingChatCard
      aria-label={`${record.candidateName} 的数据库 AI评分`}
      className="aui-resume-review-card"
      render={<section />}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-4 pt-4 pb-0">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-sm">{record.candidateName}</h3>
          <p className="mt-1 truncate text-muted-foreground text-xs">
            关联岗位：{record.jobDescriptionName ?? "已绑定岗位"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold text-2xl tabular-nums leading-none">
            {model.baseScore ?? "—"}
          </div>
          <div className="mt-1 text-muted-foreground text-[11px]">综合评分</div>
        </div>
      </CardHeader>

      <CardPanel className="grid gap-4 px-4 py-3.5 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
        <ReviewDimensionRadar dimensions={model.dimensions} />
        <div className="min-w-0">
          <p className="text-sm leading-6">
            {model.conclusion ?? "该候选人尚未生成 AI评分，六维评分暂无数据。"}
          </p>
          <dl className="mt-3 grid gap-x-4 sm:grid-cols-2">
            {model.dimensions.map((dimension) => (
              <div
                className="flex min-w-0 items-baseline justify-between gap-2 border-b py-2"
                key={dimension.key}
              >
                <dt className="truncate text-muted-foreground text-xs">{dimension.label}</dt>
                <dd className="shrink-0 font-medium text-xs tabular-nums">
                  {dimension.score ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CardPanel>

      <CardFooter className="justify-end px-4 pt-0 pb-4">
        <Button
          className="h-8 px-2.5 text-xs"
          onClick={() => openResumeDetail(record.id, "ai-analysis")}
          size="sm"
          type="button"
          variant="secondary"
        >
          查看评分详情
        </Button>
      </CardFooter>
    </RecruitingChatCard>
  );
}
