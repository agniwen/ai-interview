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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@arc/shared/utils";
import type { ReactNode } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

const REVIEW_SURFACE_CLASS = "rounded-2xl border border-muted/60 bg-muted/20 p-6";

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function SummaryItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 min-w-0 truncate font-medium text-sm leading-6">{textOrDash(value)}</dd>
    </div>
  );
}

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

function ResumeOverviewAiScoreCard({
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
    <section className="rounded-2xl border border-muted/60 bg-muted/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">AI评分</h3>
          {review ? (
            <Badge variant={actionVariant(review.nextStep.action)}>
              {resumeReviewActionLabel[review.nextStep.action]}
            </Badge>
          ) : (
            <Badge variant="outline">未生成</Badge>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="min-w-0">
          <DimensionRadarChart compact dimensions={dimensionScores} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="text-muted-foreground text-xs">综合评分</div>
              <div className="font-semibold text-4xl tabular-nums leading-none">
                {baseScore ?? "—"}
              </div>
            </div>
            {review ? <Badge variant="outline">{review.levelRecommendation.level}</Badge> : null}
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-medium text-sm">{title}</h3>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
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

function DimensionScoreGroup({ dimensions }: { dimensions: ReviewDimensionDisplay[] }) {
  return (
    <div className={cn("space-y-4", REVIEW_SURFACE_CLASS)}>
      {dimensions.map((dimension, index) => (
        <div className={cn(index > 0 ? "border-t border-border/50 pt-4" : "")} key={dimension.key}>
          <DimensionScoreItem dimension={dimension} />
        </div>
      ))}
    </div>
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
    <section className="space-y-4">
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
      <ScrollArea className="h-[28rem] rounded-2xl border border-muted/60 bg-muted/20">
        <div className="px-5 md:px-6">
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
        </div>
      </ScrollArea>
    </section>
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
    <section className={REVIEW_SURFACE_CLASS}>
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
          {summaryAction ? <div>{summaryAction}</div> : null}
          <div className="font-semibold text-7xl tabular-nums leading-none tracking-normal">
            {baseScore ?? "—"}
          </div>
          <div className="-mt-3 text-muted-foreground text-xs">综合评分 / 100</div>
        </div>
      </div>
    </section>
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
    <div className="mx-auto max-w-6xl space-y-6">
      <ReviewSummaryHero baseScore={baseScore} review={review} summaryAction={summaryAction} />

      <section className="space-y-4">
        <ReviewSectionHeader
          action={<span className="text-muted-foreground text-xs">0-100</span>}
          title="维度评分"
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={cn("flex min-w-0 items-center justify-center", REVIEW_SURFACE_CLASS)}>
            <DimensionRadarChart dimensions={dimensionScores} />
          </div>
          {dimensionScoreGroups.map((group) => (
            <DimensionScoreGroup
              dimensions={group}
              key={group.map((dimension) => dimension.key).join("-")}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <ReviewSectionHeader title="优点" />
          <ScrollArea className="h-[28rem] rounded-2xl border border-muted/60 bg-muted/20">
            <div className="px-5 md:px-6">
              <ReviewPointList items={review.strengths} tone="positive" />
            </div>
          </ScrollArea>
        </section>

        <section className="space-y-4">
          <ReviewSectionHeader title="缺点" />
          <ScrollArea className="h-[28rem] rounded-2xl border border-muted/60 bg-muted/20">
            <div className="px-5 md:px-6">
              <ReviewPointList items={review.weaknesses} tone="negative" />
            </div>
          </ScrollArea>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BiasScanSection biasCounts={biasCounts} review={review} />
        {screeningResultSlot ? <div className="min-w-0">{screeningResultSlot}</div> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={cn("space-y-4", REVIEW_SURFACE_CLASS)}>
          <ReviewSectionHeader title="团队定位建议" />
          <div className="space-y-2 text-sm leading-6">
            <p className="font-medium">{review.teamPositioning.suggestion}</p>
            <p className="text-muted-foreground">{review.teamPositioning.rationale}</p>
          </div>
        </section>

        <section className={cn("space-y-4", REVIEW_SURFACE_CLASS)}>
          <ReviewSectionHeader title="职级建议" />
          <div className="space-y-2 text-sm leading-6">
            <Badge variant="outline">{review.levelRecommendation.level}</Badge>
            <p className="text-muted-foreground">{review.levelRecommendation.rationale}</p>
          </div>
        </section>
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
      <section className="space-y-6">
        <ResumeOverviewAiScoreCard detail={detail} onViewAiScore={onViewAiScore} />

        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <SummaryItem label="关联岗位" value={detail.jobDescriptionName} />
          <SummaryItem label="简历评估" value={resumeEvaluation.label} />
        </dl>
      </section>

      <section className="space-y-4 border-t border-border/50 pt-6">
        <h3 className="font-medium text-sm">结构化信息</h3>
        <div>
          <ResumeProfileView profile={detail.resumeProfile ?? null} />
        </div>
      </section>
    </div>
  );
}
