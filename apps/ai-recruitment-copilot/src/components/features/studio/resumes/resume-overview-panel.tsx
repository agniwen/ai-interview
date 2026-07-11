"use client";

// 招聘台的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewLoose,
} from "@arc/shared/resume-review";
import {
  countResumeReviewBiasCategories,
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
  resumeReviewActionLabel,
  resumeReviewBiasCategoryLabel,
} from "@arc/shared/resume-review";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { EmptyValue } from "@/components/features/display/empty-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@arc/shared/utils";
import type { ReactNode } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

const DIMENSION_LABELS = RESUME_REVIEW_DIMENSIONS;

function actionVariant(action: ResumeReviewAction) {
  if (action === "interview") {
    return "success";
  }
  if (action === "hold") {
    return "warning";
  }
  return "danger";
}

interface ReviewDimensionDisplay {
  key: string;
  label: string;
  rationale: string;
  score: number;
  weight: number;
}

function getReviewDimensionDisplays(review: ResumeReviewLoose): ReviewDimensionDisplay[] {
  return DIMENSION_LABELS.flatMap(({ key, label, weight }) => {
    const dim = getResumeReviewDimension(review, key);
    if (!dim) {
      return [];
    }
    return [
      {
        key,
        label,
        rationale: dim.rationale,
        score: dim.score,
        weight: Math.round(weight * 100),
      },
    ];
  });
}

function DimensionRadarChart({
  compact = false,
  dimensions,
}: {
  compact?: boolean;
  dimensions: ReviewDimensionDisplay[];
}) {
  if (dimensions.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-muted/60 bg-muted/20 text-muted-foreground text-sm",
          compact ? "min-h-48" : "min-h-64",
        )}
      >
        暂无维度评分
      </div>
    );
  }

  return (
    <ChartContainer
      className={cn(
        "mx-auto aspect-square w-full",
        compact ? "min-h-[12rem] max-w-[14rem]" : "min-h-[16rem] max-w-[19rem] lg:min-h-[17rem]",
      )}
      config={{
        score: {
          color: "var(--primary)",
          label: "评分",
        },
      }}
    >
      <RadarChart
        data={dimensions}
        margin={{ bottom: 18, left: 18, right: 18, top: 18 }}
        outerRadius="72%"
      >
        <PolarGrid gridType="polygon" />
        <PolarAngleAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: compact ? 10 : 12 }}
        />
        <PolarRadiusAxis angle={90} axisLine={false} domain={[0, 100]} tick={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const payload = item.payload as ReviewDimensionDisplay | undefined;
                return (
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-foreground">
                      {payload?.label ?? "维度"}：{String(value)}
                    </div>
                    {payload ? (
                      <div className="text-muted-foreground text-xs leading-5">
                        权重 {payload.weight}% · {payload.rationale}
                      </div>
                    ) : null}
                  </div>
                );
              }}
              hideLabel
            />
          }
        />
        <Radar
          dataKey="score"
          dot={{ fill: "var(--color-score)", r: 3 }}
          fill="var(--color-score)"
          fillOpacity={0.22}
          name="评分"
          stroke="var(--color-score)"
          strokeWidth={2}
        />
      </RadarChart>
    </ChartContainer>
  );
}

function ResumeOverviewAiScoreSection({
  detail,
  onViewAiScore,
}: {
  detail: ResumeLibraryDetail;
  onViewAiScore?: () => void;
}) {
  const review = detail.resumeReview;
  const baseScore = review ? getResumeReviewBaseScore(review) : null;
  const dimensionScores = review ? getReviewDimensionDisplays(review) : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">AI评分</h3>
          {review ? (
            <Badge variant={actionVariant(review.nextStep.action)}>
              建议{resumeReviewActionLabel[review.nextStep.action]}
            </Badge>
          ) : (
            <Badge variant="outline">未生成</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="min-w-0">
          <DimensionRadarChart compact dimensions={dimensionScores} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="text-muted-foreground text-xs">综合评分</div>
              <div className="font-semibold text-4xl tabular-nums leading-none tracking-tight">
                {baseScore ?? <EmptyValue />}
              </div>
            </div>
            {/* {review ? <Badge variant="outline">{review.levelRecommendation.level}</Badge> : null} */}
          </div>
          <div className="space-y-1.5">
            <h4 className="font-semibold text-sm leading-6">
              {review?.overall.conclusion ?? "暂无 AI评分结果"}
            </h4>
            <p className="text-muted-foreground text-sm leading-6">
              {review?.overall.scoreRationale ??
                "系统完成 AI评分后，这里会展示候选人的综合评价、分数和维度分布。"}
            </p>
          </div>
          {onViewAiScore ? (
            <Button
              className="h-auto px-0 text-xs"
              onClick={onViewAiScore}
              type="button"
              variant="link"
            >
              查看详情
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReviewSectionHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3 ">
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
  items: ResumeReview["strengths"];
  tone: "positive" | "negative";
}) {
  const markerClass =
    tone === "positive" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  return (
    <ul className="divide-y divide-border/50">
      {items.map((item, index) => (
        <li
          className="grid gap-3 py-4 text-sm leading-6 sm:grid-cols-[1.75rem_minmax(0,1fr)]"
          key={`${item.point}-${index}`}
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
  review: ResumeReviewLoose;
}) {
  return (
    <Frame className="h-full">
      <ReviewSectionHeader
        action={
          <>
            <Badge variant="outline">硬缺口 {biasCounts.hardGap}</Badge>
            <Badge variant="outline">软错位 {biasCounts.softMismatch}</Badge>
            <Badge variant="outline">真实性存疑 {biasCounts.credibilityRisk}</Badge>
            <Badge variant="outline">稳定性信号 {biasCounts.stabilitySignal}</Badge>
          </>
        }
        title="偏差扫描"
      />
      <FramePanel className="flex-1">
        <ScrollArea className="h-[24rem]">
          {review.biasScan.items.length > 0 ? (
            <ul className="divide-y divide-border/50">
              {review.biasScan.items.map((item, index) => (
                <li className="py-4 text-sm leading-6" key={`${item.category}-${index}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{resumeReviewBiasCategoryLabel[item.category]}</Badge>
                    <span className="font-medium">{item.description}</span>
                  </div>
                  <p className="text-muted-foreground">{item.impact}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-muted-foreground text-sm">未发现关键偏差</p>
          )}
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
  review: ResumeReviewLoose;
  summaryAction?: ReactNode;
}) {
  return (
    <Frame>
      <ReviewSectionHeader action={summaryAction} title="综合评价" />
      <FramePanel>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">推荐建议</span>
              <Badge variant={actionVariant(review.nextStep.action)}>
                {resumeReviewActionLabel[review.nextStep.action]}
              </Badge>
              <Badge variant="outline">{review.levelRecommendation.level}</Badge>
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
  review: ResumeReviewLoose;
  screeningResultSlot?: ReactNode;
  summaryAction?: ReactNode;
}) {
  const biasCounts = countResumeReviewBiasCategories(review.biasScan.items);
  const baseScore = getResumeReviewBaseScore(review);
  const dimensionScores = getReviewDimensionDisplays(review);
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
          action={<span className="text-muted-foreground text-xs">0-100</span>}
          title="维度评分"
        />
        <div className="grid gap-1 lg:grid-cols-2">
          <FramePanel className="flex min-w-0 items-center justify-center lg:rounded-tr-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tr-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]">
            <DimensionRadarChart dimensions={dimensionScores} />
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
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame className="h-full">
          <ReviewSectionHeader title="优点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]">
              <ReviewPointList items={review.strengths} tone="positive" />
            </ScrollArea>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="缺点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]">
              <ReviewPointList items={review.weaknesses} tone="negative" />
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
          <FramePanel className="flex-1">
            <div className="space-y-2 text-sm leading-6">
              <p className="font-medium">{review.teamPositioning.suggestion}</p>
              <p className="text-muted-foreground">{review.teamPositioning.rationale}</p>
            </div>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="职级建议" />
          <FramePanel className="flex-1">
            <div className="space-y-2 text-sm leading-6">
              <Badge variant="outline">{review.levelRecommendation.level}</Badge>
              <p className="text-muted-foreground">{review.levelRecommendation.rationale}</p>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

export function ResumeOverviewPanel({
  detail,
  onViewAiScore,
}: {
  detail: ResumeLibraryDetail;
  onViewAiScore?: () => void;
}) {
  const resumeEvaluation = describeResumeEvaluationStatus(detail.resumeEvaluationStatus);

  return (
    <div className="space-y-8">
      <ResumeOverviewAiScoreSection detail={detail} onViewAiScore={onViewAiScore} />

      <section className="border-border/50 border-t pt-6">
        <DataFields columns={3} density="compact" label="候选人信息">
          <DataField label="姓名" value={detail.resumeProfile?.name} />
          <DataField
            label="关联岗位"
            value={detail.jobDescriptionName}
            valueClassName="font-medium"
          />
          <DataField label="简历评估" value={resumeEvaluation.label} valueClassName="font-medium" />
          <DataField label="性别" value={detail.resumeProfile?.gender} />
          <DataField kind="number" label="年龄" value={detail.resumeProfile?.age} />
          <DataField kind="number" label="工作年限" value={detail.resumeProfile?.workYears} />
          <DataField kind="email" label="邮箱" value={detail.resumeProfile?.email} />
          <DataField kind="phone" label="电话" value={detail.resumeProfile?.phone} />
        </DataFields>
      </section>

      <section className="border-t border-border/50 pt-6">
        <ResumeProfileView profile={detail.resumeProfile ?? null} showBasicInfo={false} />
      </section>
    </div>
  );
}
