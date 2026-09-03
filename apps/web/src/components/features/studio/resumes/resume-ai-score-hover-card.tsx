"use client";

import type { QualitativeResumeEvaluation } from "@app/db-schema/qualitative-resume-evaluation";
import { getResumeReviewBaseScore } from "@app/shared/resume-review";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { OverviewDimensionRadar } from "@/components/features/studio/resumes/resume-overview-dimension-radar";
import {
  QualitativeDimensionRadar,
  QUALITATIVE_BASIS_DESCRIPTIONS,
  QUALITATIVE_DIMENSION_ENTRIES,
  QualitativeRecommendationIndicator,
} from "@/components/features/studio/resumes/qualitative-resume-evaluation-panel";
import {
  getReviewDimensionDisplays,
  getStructuredDimensionDisplays,
  structuredConclusion,
} from "@/components/features/studio/resumes/resume-review-display";
import type { ReviewDimensionDisplay } from "@/components/features/studio/resumes/resume-review-display";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { fetchStudioResumeReview } from "@/lib/client/api";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";

interface ScoredEvaluationPreview {
  candidateName: string;
  conclusion: string;
  dimensions: ReviewDimensionDisplay[];
  evaluation: string;
  kind: "scored";
  score: number | null;
}

interface QualitativeEvaluationPreview {
  candidateName: string;
  evaluation: QualitativeResumeEvaluation;
  kind: "qualitative";
}

type EvaluationPreview = QualitativeEvaluationPreview | ScoredEvaluationPreview;

const EVALUATION_PREVIEW_SHELL_CLASS =
  "flex max-h-[min(38rem,var(--available-height,calc(100vh-2rem)))] min-h-0 w-full flex-col overflow-hidden";

function getEvaluationPreview(detail: ResumeLibraryDetail): EvaluationPreview | null {
  if (detail.resumeEvaluationArtifactMode === "qualitative" && detail.qualitativeResumeEvaluation) {
    return {
      candidateName: detail.candidateName,
      evaluation: detail.qualitativeResumeEvaluation,
      kind: "qualitative",
    };
  }

  const structuredEvaluation =
    detail.resumeEvaluationArtifactMode === "structured" ? detail.structuredResumeEvaluation : null;
  if (structuredEvaluation) {
    return {
      candidateName: detail.candidateName,
      conclusion: structuredConclusion(structuredEvaluation),
      dimensions: getStructuredDimensionDisplays(structuredEvaluation),
      evaluation:
        structuredEvaluation.narrative.overallComment ?? structuredEvaluation.narrative.summary,
      kind: "scored",
      score: structuredEvaluation.calculations.compositeScore,
    };
  }

  const { resumeReview } = detail;
  if (!resumeReview) {
    return null;
  }
  return {
    candidateName: detail.candidateName,
    conclusion: resumeReview.overall.conclusion,
    dimensions: getReviewDimensionDisplays(resumeReview),
    evaluation: resumeReview.overall.scoreRationale,
    kind: "scored",
    score: getResumeReviewBaseScore(resumeReview),
  };
}

function AiScorePreviewSkeleton() {
  return (
    <div className={EVALUATION_PREVIEW_SHELL_CLASS} data-slot="ai-score-preview-skeleton">
      <div className="flex min-w-0 shrink-0 flex-col gap-1 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Separator className="shrink-0" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid min-w-0 gap-5 p-4 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
          <Skeleton className="size-48 justify-self-center rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Separator />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-16 w-full" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DimensionDetail({ dimension }: { dimension: ReviewDimensionDisplay }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3" data-ai-score-dimension>
      <div className="min-w-0">
        <div className="font-medium text-xs leading-5">{dimension.label}</div>
        <div className="text-[11px] text-muted-foreground">权重 {dimension.weight}%</div>
        <p className="mt-1 wrap-break-word text-muted-foreground text-xs leading-5">
          {dimension.rationale}
        </p>
      </div>
      <span className="shrink-0 font-semibold text-base tabular-nums leading-5">
        {dimension.score}
      </span>
    </div>
  );
}

function AiScorePreviewContent({
  preview,
  renderRadar,
}: {
  preview: ScoredEvaluationPreview;
  renderRadar: (dimensions: ReviewDimensionDisplay[]) => ReactNode;
}) {
  return (
    <div className={EVALUATION_PREVIEW_SHELL_CLASS} data-slot="ai-score-content-shell">
      <header className="min-w-0 shrink-0 p-4" data-slot="ai-score-header">
        <h3 className="truncate font-medium text-sm" title={preview.candidateName}>
          {preview.candidateName}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">AI评分详情</p>
      </header>
      <Separator className="shrink-0" />
      <ScrollArea className="min-h-0 w-full min-w-0 flex-1" scrollFade>
        <div className="grid min-w-0 gap-5 p-4 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
          <div
            className="mx-auto w-full max-w-52 min-w-0 overflow-hidden px-1"
            data-slot="ai-score-radar"
          >
            {renderRadar(preview.dimensions)}
          </div>
          <section className="flex min-w-0 flex-col gap-2 wrap-break-word">
            <div className="flex items-end gap-1">
              <span className="font-semibold text-2xl tabular-nums leading-none">
                {preview.score ?? "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 100</span>
            </div>
            <h4 className="font-medium text-xs leading-5">{preview.conclusion}</h4>
            <p className="text-muted-foreground text-xs leading-5">{preview.evaluation}</p>
          </section>
        </div>

        <Separator />

        <section className="flex flex-col gap-3 p-3">
          <h4 className="font-medium text-xs">六维评分明细</h4>
          <div
            className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-slot="ai-score-dimension-list"
          >
            {preview.dimensions.map((dimension) => (
              <DimensionDetail dimension={dimension} key={dimension.key} />
            ))}
          </div>
        </section>
      </ScrollArea>
    </div>
  );
}

function QualitativeDimensionPreview({
  dimensionKey,
  evaluation,
  label,
}: {
  dimensionKey: (typeof QUALITATIVE_DIMENSION_ENTRIES)[number][0];
  evaluation: QualitativeResumeEvaluation;
  label: string;
}) {
  const dimension = evaluation.dimensions[dimensionKey];
  return (
    <article className="min-w-0" data-qualitative-hover-dimension={dimensionKey}>
      <div className="flex items-start justify-between gap-3">
        <h5 className="font-medium text-xs leading-5">{label}</h5>
        {"level" in dimension ? (
          <QualitativeRecommendationIndicator className="shrink-0" level={dimension.level} />
        ) : null}
      </div>
      <RestrictedMarkdownView
        className="mt-1.5 text-muted-foreground text-xs leading-5"
        content={dimension.evaluation}
      />
      <p className="mt-1 text-[11px] text-muted-foreground/80 leading-4">
        {QUALITATIVE_BASIS_DESCRIPTIONS[dimension.basis]}
      </p>
    </article>
  );
}

function QualitativePreviewContent({
  preview,
  renderRadar,
}: {
  preview: QualitativeEvaluationPreview;
  renderRadar: (evaluation: QualitativeResumeEvaluation) => ReactNode;
}) {
  const { evaluation } = preview;
  return (
    <div className={EVALUATION_PREVIEW_SHELL_CLASS} data-slot="ai-score-content-shell">
      <header className="min-w-0 shrink-0 p-4" data-slot="ai-score-header">
        <h3 className="truncate font-medium text-sm" title={preview.candidateName}>
          {preview.candidateName}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">AI 六维评价</p>
      </header>
      <Separator className="shrink-0" />
      <ScrollArea className="min-h-0 w-full min-w-0 flex-1" scrollFade>
        <section
          className="grid min-w-0 gap-5 p-4 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start"
          data-slot="qualitative-overall-section"
        >
          <div
            className="mx-auto w-full max-w-60 min-w-0 overflow-hidden px-1"
            data-slot="ai-score-radar"
          >
            {renderRadar(evaluation)}
          </div>
          <section className="flex min-w-0 flex-col gap-3 wrap-break-word">
            <div className="flex flex-wrap items-center gap-2">
              <QualitativeRecommendationIndicator level={evaluation.recommendationLevel} />
              <h4 className="font-medium text-sm leading-6">{evaluation.conciseOverall}</h4>
            </div>
            <div>
              <h5 className="mb-1 font-medium text-xs">详细分析</h5>
              <RestrictedMarkdownView
                className="text-muted-foreground text-xs leading-5"
                content={evaluation.detailedOverall.judgment}
              />
            </div>
          </section>
        </section>

        <Separator />

        <section
          className="grid min-w-0 gap-5 p-4 sm:grid-cols-2"
          data-slot="qualitative-evidence-section"
        >
          <div>
            <h4 className="mb-1 font-medium text-xs">匹配依据</h4>
            <RestrictedMarkdownView
              className="text-muted-foreground text-xs leading-5"
              content={evaluation.detailedOverall.matchingEvidence}
            />
          </div>
          <div>
            <h4 className="mb-1 font-medium text-xs">风险与待确认项</h4>
            <RestrictedMarkdownView
              className="text-muted-foreground text-xs leading-5"
              content={evaluation.detailedOverall.risks}
            />
          </div>
        </section>

        <Separator />

        <section className="p-4" data-slot="qualitative-dimensions-section">
          <div
            className="grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
            data-slot="qualitative-dimension-list"
          >
            {QUALITATIVE_DIMENSION_ENTRIES.map(([dimensionKey, label]) => (
              <QualitativeDimensionPreview
                dimensionKey={dimensionKey}
                evaluation={evaluation}
                key={dimensionKey}
                label={label}
              />
            ))}
          </div>
        </section>
      </ScrollArea>
    </div>
  );
}

export interface ResumeAiScoreDependencies {
  fetchReview: typeof fetchStudioResumeReview;
  renderQualitativeRadar: (evaluation: QualitativeResumeEvaluation) => ReactNode;
  renderRadar: (dimensions: ReviewDimensionDisplay[]) => ReactNode;
  slug: string | null;
}

export function ResumeAiScoreHoverCardView({
  children,
  className,
  dependencies,
  onClick,
  recordId,
}: {
  children: ReactNode;
  className?: string;
  dependencies: ResumeAiScoreDependencies;
  onClick?: () => void;
  recordId: string;
}) {
  const { fetchReview, renderQualitativeRadar, renderRadar, slug } = dependencies;
  const [open, setOpen] = useState(false);
  const querySlug = slug ?? "";
  const detailQuery = useQuery({
    enabled: open && Boolean(slug),
    queryFn: () => fetchReview(querySlug, recordId),
    queryKey: ["studio-resumes", slug, "review", recordId] as const,
    staleTime: 60_000,
  });
  const preview = detailQuery.data ? getEvaluationPreview(detailQuery.data) : null;

  if (!slug) {
    return <span className={className}>{children}</span>;
  }

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        render={
          <button
            className={cn(
              "text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40 focus-visible:decoration-foreground/40 focus-visible:outline-none",
              className,
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (onClick) {
                onClick();
              } else {
                setOpen(true);
              }
            }}
            type="button"
          >
            {children}
          </button>
        }
      />
      <HoverCardContent
        align="start"
        className="w-[56rem] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={8}
      >
        {detailQuery.isPending || preview ? (
          <SkeletonReveal loading={detailQuery.isPending} skeleton={<AiScorePreviewSkeleton />}>
            {preview?.kind === "qualitative" ? (
              <QualitativePreviewContent preview={preview} renderRadar={renderQualitativeRadar} />
            ) : null}
            {preview?.kind === "scored" ? (
              <AiScorePreviewContent preview={preview} renderRadar={renderRadar} />
            ) : null}
          </SkeletonReveal>
        ) : null}
        {detailQuery.isError || detailQuery.data === null ? (
          <p className="p-4 text-destructive text-sm">AI评分详情加载失败，请稍后重试。</p>
        ) : null}
        {detailQuery.data && !preview ? (
          <p className="p-4 text-muted-foreground text-sm">暂无 AI评分详情。</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

export function ResumeAiScoreHoverCard({
  children,
  className,
  onClick,
  recordId,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  recordId: string;
}) {
  const slug = useOptionalWorkspaceSlug();
  return (
    <ResumeAiScoreHoverCardView
      className={className}
      dependencies={{
        fetchReview: fetchStudioResumeReview,
        renderQualitativeRadar: (evaluation) => (
          <QualitativeDimensionRadar compact evaluation={evaluation} />
        ),
        renderRadar: (dimensions) => (
          <OverviewDimensionRadar compact dimensions={dimensions} showTooltip={false} />
        ),
        slug,
      }}
      onClick={onClick}
      recordId={recordId}
    >
      {children}
    </ResumeAiScoreHoverCardView>
  );
}
