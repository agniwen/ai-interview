"use client";

// 简历库的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus, describeResumeProgress } from "@arc/shared/studio-resumes";
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
import { truncateText } from "@/components/features/studio/interviews/interview-detail/helpers";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
import { useState } from "react";
import type { ReactNode } from "react";
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

function DimensionScore({
  label,
  rationale,
  score,
}: {
  label: string;
  rationale: string;
  score: number;
}) {
  return (
    <div className="grid gap-3 py-4 md:grid-cols-[9rem_minmax(0,1fr)_4rem] md:items-start">
      <div className="font-medium text-sm leading-6">{label}</div>
      <div className="min-w-0 space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
        </div>
        <p className="text-muted-foreground text-sm leading-6">{rationale}</p>
      </div>
      <div className="font-semibold text-lg tabular-nums md:text-right">{score}</div>
    </div>
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

export function ResumeReviewStructuredView({ review }: { review: ResumeReviewLoose }) {
  const biasCounts = countResumeReviewBiasCategories(review.biasScan.items);
  const baseScore = getResumeReviewBaseScore(review);

  return (
    <div className="mx-auto space-y-8">
      <section className="rounded-2xl border border-muted/60 bg-muted/20 p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={actionVariant(review.nextStep.action)}>
                {resumeReviewActionLabel[review.nextStep.action]}
              </Badge>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base leading-7">{review.overall.conclusion}</h3>
              <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                {review.overall.scoreRationale}
              </p>
            </div>
          </div>
          <div className="shrink-0 md:text-right">
            <div className="font-semibold text-5xl tabular-nums leading-none">
              {baseScore ?? "—"}
            </div>
            <div className="mt-1 text-muted-foreground text-xs">综合评分 / 100</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <ReviewSectionHeader
          action={<span className="text-muted-foreground text-xs">0-100</span>}
          title="维度评分"
        />
        <div className="divide-y divide-border/50 rounded-2xl border border-muted/60 bg-muted/20 px-5 md:px-6">
          {DIMENSION_LABELS.map(({ key, label }) => {
            const dim = getResumeReviewDimension(review, key);
            if (!dim) {
              return null;
            }
            return (
              <DimensionScore key={key} label={label} rationale={dim.rationale} score={dim.score} />
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <ReviewSectionHeader title="优点" />
          <div className="rounded-2xl border border-muted/60 bg-muted/20 px-5 md:px-6">
            <ReviewPointList items={review.strengths} tone="positive" />
          </div>
        </section>

        <section className="space-y-4">
          <ReviewSectionHeader title="缺点" />
          <div className="rounded-2xl border border-muted/60 bg-muted/20 px-5 md:px-6">
            <ReviewPointList items={review.weaknesses} tone="negative" />
          </div>
        </section>
      </div>

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
        <div className="rounded-2xl border border-muted/60 bg-muted/20 px-5 md:px-6">
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
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-muted/60 bg-muted/20 p-5 md:p-6">
          <ReviewSectionHeader title="团队定位建议" />
          <div className="space-y-2 text-sm leading-6">
            <p className="font-medium">{review.teamPositioning.suggestion}</p>
            <p className="text-muted-foreground">{review.teamPositioning.rationale}</p>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-muted/60 bg-muted/20 p-5 md:p-6">
          <ReviewSectionHeader title="下一步建议" />
          <div className="space-y-2 text-sm leading-6">
            <Badge variant={actionVariant(review.nextStep.action)}>
              {resumeReviewActionLabel[review.nextStep.action]}
            </Badge>
            <p>{review.nextStep.rationale}</p>
            {review.nextStep.interviewFocus.length > 0 ? (
              <p className="text-muted-foreground">
                面试重点：{review.nextStep.interviewFocus.join("；")}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-muted/60 bg-muted/20 p-5 md:p-6">
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
  const resumeEvaluation = describeResumeEvaluationStatus(detail.resumeEvaluationStatus);

  return (
    <div className="space-y-8">
      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm">候选人摘要</h3>
              <Badge variant={progress.tone}>{progress.label}</Badge>
            </div>
            <ExpandableMarkdownSummary value={detail.notes} />
          </div>
        </div>

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
