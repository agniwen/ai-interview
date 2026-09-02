import { IconSparkles } from "@tabler/icons-react";
import { describeResumeLibraryReviewCard } from "@app/shared/resume-review";
import type { ResumeReviewActionTone } from "@app/shared/resume-review";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import { ResumeAiScoreHoverCard } from "./resume-ai-score-hover-card";
import type { ResumeLibraryCardProps } from "./resume-library-card.types";

const REVIEW_ACTION_TONE_CLASS = {
  danger: "text-rose-700 dark:text-rose-300",
  muted: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
} satisfies Record<ResumeReviewActionTone, string>;

const QUALITATIVE_RECOMMENDATION_TONE_CLASS = {
  highly_recommended: "text-purple-700 dark:text-purple-300",
  not_recommended: "text-red-700 dark:text-red-300",
  recommended: "text-green-700 dark:text-green-300",
  undecided: "text-yellow-700 dark:text-yellow-300",
} satisfies Record<NonNullable<ResumeLibraryListRecord["qualitativeRecommendationLevel"]>, string>;

interface StructuredReviewCardDescription {
  label: string;
  tone: ResumeReviewActionTone;
}

function describeStructuredReviewCard(
  record: ResumeLibraryListRecord,
): StructuredReviewCardDescription {
  if (record.resumeEvaluationStatus === "pass") {
    return { label: "HR 已通过", tone: "success" };
  }
  if (record.resumeEvaluationStatus === "fail") {
    return { label: "HR 未通过", tone: "danger" };
  }
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return { label: "AI 评估中", tone: "muted" };
  }
  if (record.structuredGateStatus === "failed") {
    return {
      label:
        record.structuredCompositeScore === null
          ? "未通过门槛"
          : `未通过门槛 · ${record.structuredCompositeScore} 分`,
      tone: "danger",
    };
  }
  if (record.structuredGateStatus === "needs_verification") {
    return { label: "门槛待核实", tone: "warning" };
  }
  if (record.structuredCompositeScore !== null) {
    const gradeLabel = {
      matched: "匹配",
      recommended: "推荐",
      unmatched: "不匹配",
    }[record.structuredScoreGrade ?? "unmatched"];
    let tone: ResumeReviewActionTone = "danger";
    if (record.structuredScoreGrade === "recommended") {
      tone = "success";
    } else if (record.structuredScoreGrade === "matched") {
      tone = "warning";
    }
    return {
      label: `${gradeLabel} · ${record.structuredCompositeScore} 分`,
      tone,
    };
  }
  return { label: "待 AI 评估", tone: "muted" };
}

function describeQualitativeReviewCard(
  level: ResumeLibraryListRecord["qualitativeRecommendationLevel"],
): StructuredReviewCardDescription {
  if (!level) {
    return { label: "待 AI 评价", tone: "muted" };
  }
  return (
    {
      highly_recommended: { label: "非常推荐", tone: "success" },
      not_recommended: { label: "不推荐", tone: "danger" },
      recommended: { label: "推荐", tone: "success" },
      undecided: { label: "待定", tone: "warning" },
    } satisfies Record<
      NonNullable<ResumeLibraryListRecord["qualitativeRecommendationLevel"]>,
      StructuredReviewCardDescription
    >
  )[level];
}

function resumeReplacementAttemptLabel(
  record: ResumeLibraryListRecord,
  artifactMode: ResumeLibraryListRecord["resumeEvaluationArtifactMode"],
) {
  const isSupportedAttempt =
    record.resumeEvaluationAttemptMode === "qualitative" ||
    (artifactMode === "legacy" && record.resumeEvaluationAttemptMode === "structured");
  if (!isSupportedAttempt) {
    return null;
  }
  const isReplacingOldResult = artifactMode !== "qualitative";
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return isReplacingOldResult ? "新版重评中" : "重新评价中";
  }
  if (record.resumeReviewStatus === "failed") {
    return isReplacingOldResult ? "新版重评失败" : "重新评价失败";
  }
  return null;
}

function buildResumeReviewSummaryTitle(
  label: string,
  replacementAttemptLabel: string | null,
  summary: string | null,
) {
  const replacement = replacementAttemptLabel ? ` · ${replacementAttemptLabel}` : "";
  const description = summary ? ` ${summary}` : "";
  return `${label}${replacement}${description}`;
}

export function ResumeLibraryEvaluationSummary({
  onOpenDetail,
  record,
  summary,
}: {
  onOpenDetail: ResumeLibraryCardProps["onOpenDetail"];
  record: ResumeLibraryListRecord;
  summary: string | null;
}) {
  const artifactMode = record.resumeEvaluationArtifactMode ?? record.jobEvaluationMode;
  const hasRetainedLegacyReview =
    artifactMode === "legacy" && record.resumeReviewBaseScore !== null;
  let baseReviewCard: StructuredReviewCardDescription = describeResumeLibraryReviewCard({
    baseScore: record.resumeReviewBaseScore,
    nextStepAction: record.resumeReviewNextStepAction,
    status: hasRetainedLegacyReview ? "ready" : record.resumeReviewStatus,
  });
  if (artifactMode === "qualitative") {
    baseReviewCard = describeQualitativeReviewCard(record.qualitativeRecommendationLevel);
  } else if (artifactMode === "structured") {
    baseReviewCard = describeStructuredReviewCard(record);
  }
  const reviewCard = hasRetainedLegacyReview
    ? { ...baseReviewCard, label: `老版本结果 · ${baseReviewCard.label}` }
    : baseReviewCard;
  let hasAiScoreDetail = record.resumeReviewBaseScore !== null;
  if (artifactMode === "qualitative") {
    hasAiScoreDetail = record.qualitativeRecommendationLevel !== null;
  } else if (artifactMode === "structured") {
    hasAiScoreDetail = record.structuredCompositeScore !== null;
  }
  const replacementAttemptLabel = resumeReplacementAttemptLabel(record, artifactMode);
  const reviewSummaryTitle = buildResumeReviewSummaryTitle(
    reviewCard.label,
    replacementAttemptLabel,
    summary,
  );
  const reviewToneClass =
    artifactMode === "qualitative" && record.qualitativeRecommendationLevel
      ? QUALITATIVE_RECOMMENDATION_TONE_CLASS[record.qualitativeRecommendationLevel]
      : REVIEW_ACTION_TONE_CLASS[reviewCard.tone];
  const reviewLabel = (
    <span className={cn("font-medium", reviewToneClass)}>{reviewCard.label}</span>
  );
  const summaryContent = (
    <>
      <IconSparkles
        aria-hidden
        className={cn("mr-1 inline size-3.5 align-[-2px]", reviewToneClass)}
      />
      {reviewLabel}
      {replacementAttemptLabel ? ` · ${replacementAttemptLabel}` : null}
      {summary ? ` ${summary}` : null}
    </>
  );

  if (hasAiScoreDetail) {
    return (
      <p className="mt-3" title={reviewSummaryTitle}>
        <ResumeAiScoreHoverCard
          className="block w-full line-clamp-3 text-[13px] text-muted-foreground leading-[19px]"
          onClick={
            artifactMode === "qualitative" ? () => onOpenDetail(record, "ai-analysis") : undefined
          }
          recordId={record.id}
        >
          {summaryContent}
        </ResumeAiScoreHoverCard>
      </p>
    );
  }

  return (
    <p
      className="mt-3 line-clamp-3 text-[13px] text-muted-foreground leading-[19px]"
      title={reviewSummaryTitle}
    >
      {summaryContent}
    </p>
  );
}
