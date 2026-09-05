/* oxlint-disable complexity -- AI score section branches across legacy and structured evaluation modes. */
"use client";

import { getResumeReviewBaseScore, resumeReviewActionLabel } from "@app/shared/resume-review";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import type { ReactNode } from "react";
import { EmptyValue } from "@/components/features/display/empty-value";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resumeEvaluationNotice,
  getResumeEvaluationMode,
} from "./resume-library-evaluation-summary";
import { OverviewDimensionRadar } from "./resume-overview-dimension-radar";
import {
  QualitativeDimensionRadar,
  QUALITATIVE_RECOMMENDATION_LABEL,
} from "./qualitative-resume-evaluation-panel";
import {
  actionVariant,
  getReviewDimensionDisplays,
  getStructuredDimensionDisplays,
  structuredConclusion,
  structuredGateVariant,
  STRUCTURED_GATE_LABELS,
  STRUCTURED_GRADE_LABELS,
} from "./resume-review-display";

export function ResumeOverviewAiScoreSection({
  detail,
  onViewAiScore,
}: {
  detail: ResumeLibraryDetail;
  onViewAiScore?: () => void;
}) {
  const mode = getResumeEvaluationMode(detail);
  const notice = resumeEvaluationNotice(detail);
  if (mode === "qualitative" && detail.qualitativeResumeEvaluation) {
    const evaluation = detail.qualitativeResumeEvaluation;
    return (
      <section className="space-y-4">
        <div className="flex min-h-10 flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">AI评价</h3>
        </div>
        {notice ? (
          <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
            {notice}
          </p>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div className="min-w-0">
            <QualitativeDimensionRadar compact evaluation={evaluation} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="text-muted-foreground text-xs">综合评价</div>
              <div
                className="font-semibold text-4xl leading-none tracking-tight"
                data-qualitative-overview-recommendation
              >
                {QUALITATIVE_RECOMMENDATION_LABEL[evaluation.recommendationLevel]}
              </div>
            </div>
            <div data-qualitative-overview-judgment>
              <RestrictedMarkdownView
                className="text-sm leading-6"
                content={evaluation.detailedOverall.judgment}
              />
            </div>
            {onViewAiScore ? (
              <Button
                className="h-auto self-center px-0 text-xs lg:self-start"
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
  if (!detail.resumeEvaluationArtifactMode || mode === "qualitative") {
    return (
      <section className="space-y-3">
        <h3 className="font-medium text-sm">AI评价</h3>
        <p className="text-muted-foreground text-sm">
          {notice ??
            (detail.jobDescriptionId ? "暂无 AI 评价。" : "请先为候选人关联岗位，再生成 AI 评价。")}
        </p>
        {onViewAiScore ? (
          <Button onClick={onViewAiScore} type="button" variant="link">
            查看详情
          </Button>
        ) : null}
      </section>
    );
  }
  const review = detail.resumeReview;
  const structuredEvaluation =
    detail.resumeEvaluationArtifactMode === "structured" ? detail.structuredResumeEvaluation : null;
  let score = review ? getResumeReviewBaseScore(review) : null;
  let conclusion: string | null = review?.overall.conclusion ?? "暂无 AI评分结果";
  let scoreRationale =
    review?.overall.scoreRationale ??
    "系统完成 AI评分后，这里会展示候选人的综合评价、分数和维度分布。";
  let dimensionScores = review ? getReviewDimensionDisplays(review) : [];
  let statusBadges: ReactNode = review ? (
    <Badge variant={actionVariant(review.nextStep.action)}>
      建议{resumeReviewActionLabel[review.nextStep.action]}
    </Badge>
  ) : (
    <span className="text-muted-foreground text-xs">未生成</span>
  );

  if (detail.resumeEvaluationArtifactMode === "structured") {
    score = structuredEvaluation?.calculations.compositeScore ?? null;
    conclusion = structuredEvaluation
      ? structuredConclusion(structuredEvaluation)
      : "暂无 AI评分结果";
    scoreRationale = structuredEvaluation
      ? (structuredEvaluation.narrative.overallComment ?? structuredEvaluation.narrative.summary)
      : "系统完成 AI评分后，这里会展示候选人的综合评价、分数和维度分布。";
    dimensionScores = structuredEvaluation
      ? getStructuredDimensionDisplays(structuredEvaluation)
      : [];
    statusBadges = structuredEvaluation ? (
      <>
        <Badge variant={structuredGateVariant(structuredEvaluation.gates.effectiveStatus)}>
          {STRUCTURED_GATE_LABELS[structuredEvaluation.gates.effectiveStatus]}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {STRUCTURED_GRADE_LABELS[structuredEvaluation.grade]} ·{" "}
          {structuredEvaluation.calculations.compositeScore} 分
        </span>
      </>
    ) : (
      <span className="text-muted-foreground text-xs">未生成</span>
    );
    if (!structuredEvaluation && detail.resumeReviewStatus === "failed") {
      conclusion = detail.resumeReviewError || "评估失败";
    }
  }

  statusBadges = (
    <>
      <Badge variant="outline">历史评分</Badge>
      {statusBadges}
    </>
  );
  const retainedResultNotice = notice;

  return (
    <section className="space-y-4">
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <h3 className="font-medium text-sm">AI评价</h3>
        {statusBadges}
      </div>

      {retainedResultNotice ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
          {retainedResultNotice}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="min-w-0">
          <OverviewDimensionRadar compact dimensions={dimensionScores} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1.5">
            <div className="text-muted-foreground text-xs">综合评分</div>
            <div className="font-semibold text-4xl tabular-nums leading-none tracking-tight">
              {score ?? <EmptyValue />}
            </div>
          </div>
          <div className="space-y-1.5">
            {conclusion ? <h4 className="font-semibold text-sm leading-6">{conclusion}</h4> : null}
            <p className="text-muted-foreground text-sm leading-6">{scoreRationale}</p>
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
