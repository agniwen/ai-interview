"use client";

import {
  countResumeReviewBiasCategories,
  getResumeReviewBaseScore,
  resumeReviewActionLabel,
  resumeReviewBiasCategoryLabel,
} from "@app/shared/resume-review";
import type { ResumeReview, ResumeReviewLoose } from "@app/shared/resume-review";
import type { ReactNode } from "react";
import { EmptyValue } from "@/components/features/display/empty-value";
import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@app/shared/utils";
import { OverviewDimensionRadar, UnevaluatedText } from "./resume-overview-dimension-radar";
import { actionVariant, getReviewDimensionDisplays } from "./resume-review-display";
import type { ReviewDimensionDisplay } from "./resume-review-display";

function ReviewSectionHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3 h-10 ">
      <FrameTitle>{title}</FrameTitle>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </FrameHeader>
  );
}

function DimensionScoreItem({ dimension }: { dimension: ReviewDimensionDisplay }) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-6">{dimension.label}</div>
          <div className="mt-0.5 text-muted-foreground text-xs">权重 {dimension.weight}%</div>
        </div>
        <div className="font-semibold text-xl tabular-nums leading-none">{dimension.score}</div>
      </div>
      <p className="mt-3 text-muted-foreground text-sm leading-6">{dimension.rationale}</p>
    </div>
  );
}

function DimensionScoreGroup({
  className,
  dimensions,
}: {
  className?: string;
  dimensions: ReviewDimensionDisplay[];
}) {
  return (
    <FramePanel className={cn("space-y-4", className)}>
      {dimensions.map((dimension, index) => (
        <div className={cn(index > 0 ? "border-t border-border/50 pt-4" : "")} key={dimension.key}>
          <DimensionScoreItem dimension={dimension} />
        </div>
      ))}
    </FramePanel>
  );
}

function ReviewPointList({
  items,
  tone,
}: {
  items: ResumeReview["strengths"] | undefined;
  tone: "positive" | "negative";
}) {
  const markerClass =
    tone === "positive" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  if (!items?.length) {
    return (
      <div className="flex h-[24rem] w-full min-w-0 items-center justify-center">
        <UnevaluatedText />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/50">
      {items.map((item, index) => (
        <li
          className="grid gap-3 py-4 text-sm leading-6 sm:grid-cols-[1.75rem_minmax(0,1fr)]"
          key={`${item.point}-${item.evidence ?? ""}-${item.impact}`}
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full font-medium text-xs tabular-nums",
              markerClass,
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="font-medium">{item.point}</p>
            <p className="text-muted-foreground">{item.evidence?.trim() || "待核实"}</p>
            <p className="text-muted-foreground">影响：{item.impact}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BiasScanSection({
  biasCounts,
  review,
}: {
  biasCounts: ReturnType<typeof countResumeReviewBiasCategories>;
  review: ResumeReviewLoose | null | undefined;
}) {
  const items = review?.biasScan.items ?? [];
  let body: ReactNode;
  if (!review) {
    body = (
      <div className="flex h-[24rem] w-full min-w-0 items-center justify-center">
        <UnevaluatedText />
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="py-5 text-muted-foreground text-sm">未发现关键偏差</p>;
  } else {
    body = (
      <ul className="divide-y divide-border/50">
        {items.map((item) => (
          <li
            className="py-4 text-sm leading-6"
            key={`${item.category}-${item.description}-${item.impact}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {resumeReviewBiasCategoryLabel[item.category]}
              </span>
              <span className="font-medium">{item.description}</span>
            </div>
            <p className="text-muted-foreground">{item.impact}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Frame className="h-full">
      <ReviewSectionHeader
        action={
          review ? (
            <>
              <span className="text-muted-foreground text-xs">硬缺口 {biasCounts.hardGap}</span>
              <span className="text-muted-foreground text-xs">
                软错位 {biasCounts.softMismatch}
              </span>
              <span className="text-muted-foreground text-xs">
                真实性存疑 {biasCounts.credibilityRisk}
              </span>
              <span className="text-muted-foreground text-xs">
                稳定性信号 {biasCounts.stabilitySignal}
              </span>
            </>
          ) : undefined
        }
        title="偏差扫描"
      />
      <FramePanel className="flex-1">
        <ScrollArea className="h-[24rem]" scrollFade>
          {body}
        </ScrollArea>
      </FramePanel>
    </Frame>
  );
}

function ReviewSummaryHero({
  baseScore,
  review,
  summaryAction,
}: {
  baseScore: number | null;
  review: ResumeReviewLoose | null | undefined;
  summaryAction?: ReactNode;
}) {
  return (
    <Frame>
      <ReviewSectionHeader action={summaryAction} title="综合评价" />
      <FramePanel>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
          <div className="min-w-0 space-y-5">
            {review ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">推荐建议</span>
                  <Badge variant={actionVariant(review.nextStep.action)}>
                    {resumeReviewActionLabel[review.nextStep.action]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {review.levelRecommendation.level}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-base leading-7">{review.overall.conclusion}</h3>
                  <p className="text-muted-foreground text-sm leading-6">
                    {review.overall.scoreRationale}
                  </p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <div className="text-muted-foreground text-xs">下一步行动</div>
                    <p className="text-sm leading-6">{review.nextStep.rationale}</p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-muted-foreground text-xs">团队定位</div>
                    <p className="text-sm leading-6">{review.teamPositioning.suggestion}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-32 items-center">
                <UnevaluatedText />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-start gap-5 lg:items-end lg:text-right">
            <div className="font-semibold text-7xl tabular-nums leading-none tracking-tighter">
              {baseScore ?? <EmptyValue />}
            </div>
            <div className="-mt-3 text-muted-foreground text-xs">综合评分 / 100</div>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function ResumeReviewStructuredView({
  review,
  screeningResultSlot,
  summaryAction,
}: {
  review: ResumeReviewLoose | null | undefined;
  screeningResultSlot?: ReactNode;
  summaryAction?: ReactNode;
}) {
  const biasCounts = countResumeReviewBiasCategories(review?.biasScan.items ?? []);
  const baseScore = review ? getResumeReviewBaseScore(review) : null;
  const dimensionScores = review ? getReviewDimensionDisplays(review) : [];
  const dimensionScoreGroups = [
    dimensionScores.slice(0, 2),
    dimensionScores.slice(2, 4),
    dimensionScores.slice(4, 6),
  ].filter((group) => group.length > 0);

  return (
    <div className="w-full space-y-6">
      <ReviewSummaryHero baseScore={baseScore} review={review} summaryAction={summaryAction} />

      <Frame>
        <ReviewSectionHeader
          action={review ? <span className="text-muted-foreground text-xs">0-100</span> : undefined}
          title="维度评分"
        />
        {review ? (
          <div className="grid gap-1 lg:grid-cols-2">
            <FramePanel className="flex min-w-0 items-center justify-center lg:rounded-tr-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tr-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]">
              <OverviewDimensionRadar dimensions={dimensionScores} />
            </FramePanel>
            {dimensionScoreGroups.map((group, index) => (
              <DimensionScoreGroup
                className={cn(
                  index === 0 &&
                    "lg:rounded-tl-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]",
                  index === 1 &&
                    "lg:rounded-tl-[2px] lg:rounded-tr-[2px] lg:rounded-br-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-tr-[1px] lg:before:rounded-br-[1px]",
                  index === 2 &&
                    "lg:rounded-tl-[2px] lg:rounded-tr-[2px] lg:rounded-bl-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-tr-[1px] lg:before:rounded-bl-[1px]",
                )}
                dimensions={group}
                key={group.map((dimension) => dimension.key).join("-")}
              />
            ))}
          </div>
        ) : (
          <FramePanel className="flex min-h-48 w-full min-w-0 items-center justify-center">
            <UnevaluatedText />
          </FramePanel>
        )}
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame className="h-full">
          <ReviewSectionHeader title="优点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]" scrollFade>
              <ReviewPointList items={review?.strengths} tone="positive" />
            </ScrollArea>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="缺点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]" scrollFade>
              <ReviewPointList items={review?.weaknesses} tone="negative" />
            </ScrollArea>
          </FramePanel>
        </Frame>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BiasScanSection biasCounts={biasCounts} review={review} />
        {screeningResultSlot ? (
          <div className="h-full min-w-0 [&>[data-slot=frame]]:h-full">{screeningResultSlot}</div>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Frame className="h-full">
          <ReviewSectionHeader title="团队定位建议" />
          <FramePanel className="flex flex-1 items-center">
            {review ? (
              <div className="space-y-2 text-sm leading-6">
                <p className="font-medium">{review.teamPositioning.suggestion}</p>
                <p className="text-muted-foreground">{review.teamPositioning.rationale}</p>
              </div>
            ) : (
              <UnevaluatedText />
            )}
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="职级建议" />
          <FramePanel className="flex flex-1 items-center">
            {review ? (
              <div className="space-y-2 text-sm leading-6">
                <span className="text-muted-foreground text-xs">
                  {review.levelRecommendation.level}
                </span>
                <p className="text-muted-foreground">{review.levelRecommendation.rationale}</p>
              </div>
            ) : (
              <UnevaluatedText />
            )}
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}
