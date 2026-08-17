"use client";

import { getResumeReviewBaseScore } from "@arc/shared/resume-review";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { OverviewDimensionRadar } from "@/components/features/studio/resumes/resume-overview-dimension-radar";
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
import { fetchStudioResumeReview } from "@/lib/client/api";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";

interface AiScorePreview {
  candidateName: string;
  conclusion: string;
  dimensions: ReviewDimensionDisplay[];
  evaluation: string;
  score: number | null;
}

function getAiScorePreview(detail: ResumeLibraryDetail): AiScorePreview | null {
  const structuredEvaluation =
    detail.resumeEvaluationArtifactMode === "structured" ? detail.structuredResumeEvaluation : null;
  if (structuredEvaluation) {
    return {
      candidateName: detail.candidateName,
      conclusion: structuredConclusion(structuredEvaluation),
      dimensions: getStructuredDimensionDisplays(structuredEvaluation),
      evaluation:
        structuredEvaluation.narrative.overallComment ?? structuredEvaluation.narrative.summary,
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
    score: getResumeReviewBaseScore(resumeReview),
  };
}

function AiScorePreviewSkeleton() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden" data-slot="ai-score-preview-skeleton">
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Separator />
      <div className="grid min-w-0 gap-4 p-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
        <Skeleton className="size-40 justify-self-center rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-3 p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
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

function AiScorePreviewContent({ preview }: { preview: AiScorePreview }) {
  return (
    <ScrollArea className="max-h-[calc(100vh-2rem)] w-full min-w-0 sm:max-h-[34rem]" scrollFade>
      <div className="flex min-w-0 flex-col overflow-hidden" data-slot="ai-score-content-shell">
        <header className="min-w-0 p-3" data-slot="ai-score-header">
          <h3 className="truncate font-medium text-sm" title={preview.candidateName}>
            {preview.candidateName}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">AI评分详情</p>
        </header>

        <Separator />

        <div className="grid min-w-0 gap-4 p-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
          <div
            className="mx-auto w-full max-w-52 min-w-0 overflow-hidden px-1"
            data-slot="ai-score-radar"
          >
            <OverviewDimensionRadar compact dimensions={preview.dimensions} showTooltip={false} />
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
          <div className="flex min-w-0 flex-col gap-3" data-slot="ai-score-dimension-list">
            {preview.dimensions.map((dimension) => (
              <DimensionDetail dimension={dimension} key={dimension.key} />
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

export function ResumeAiScoreHoverCard({
  children,
  className,
  recordId,
}: {
  children: ReactNode;
  className?: string;
  recordId: string;
}) {
  const slug = useOptionalWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const querySlug = slug ?? "";
  const detailQuery = useQuery({
    enabled: open && Boolean(slug),
    queryFn: () => fetchStudioResumeReview(querySlug, recordId),
    queryKey: ["studio-resumes", slug, "review", recordId] as const,
    staleTime: 60_000,
  });
  const preview = detailQuery.data ? getAiScorePreview(detailQuery.data) : null;

  if (!slug) {
    return <span className={className}>{children}</span>;
  }

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        render={
          <button
            className={cn(
              "cursor-pointer text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-foreground/40 focus-visible:decoration-foreground/40 focus-visible:outline-none",
              className,
            )}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
            type="button"
          >
            {children}
          </button>
        }
      />
      <HoverCardContent
        align="start"
        className="w-[34rem] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={8}
      >
        {detailQuery.isPending ? <AiScorePreviewSkeleton /> : null}
        {detailQuery.isError || detailQuery.data === null ? (
          <p className="p-4 text-destructive text-sm">AI评分详情加载失败，请稍后重试。</p>
        ) : null}
        {detailQuery.data && !preview ? (
          <p className="p-4 text-muted-foreground text-sm">暂无 AI评分详情。</p>
        ) : null}
        {preview ? <AiScorePreviewContent preview={preview} /> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
