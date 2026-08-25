import { IconSparkles } from "@tabler/icons-react";
import { describeResumeLibraryReviewCard } from "@arc/shared/resume-review";
import type { ResumeReviewActionTone } from "@arc/shared/resume-review";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { ResumeAiScoreHoverCard } from "./resume-ai-score-hover-card";
import { QualitativeRecommendationBadge } from "./qualitative-resume-evaluation-panel";
import type { ResumeLibraryCardProps } from "./resume-library-card.types";

const REVIEW_ACTION_TONE_CLASS = {
  danger: "text-rose-700 dark:text-rose-300",
  muted: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
} satisfies Record<ResumeReviewActionTone, string>;

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

function qualitativeRecommendationLabel(
  level: ResumeLibraryListRecord["qualitativeRecommendationLevel"],
) {
  if (!level) {
    return "待 AI 评价";
  }
  return {
    highly_recommended: "非常推荐",
    not_recommended: "不推荐",
    recommended: "推荐",
    undecided: "待定",
  }[level];
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
  const qualitativeLabel = qualitativeRecommendationLabel(record.qualitativeRecommendationLevel);
  let baseReviewCard: StructuredReviewCardDescription = describeResumeLibraryReviewCard({
    baseScore: record.resumeReviewBaseScore,
    nextStepAction: record.resumeReviewNextStepAction,
    status: hasRetainedLegacyReview ? "ready" : record.resumeReviewStatus,
  });
  if (artifactMode === "qualitative") {
    baseReviewCard = { label: qualitativeLabel, tone: "muted" };
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
  let reviewLabel = (
    <span className={cn("font-medium", REVIEW_ACTION_TONE_CLASS[reviewCard.tone])}>
      {reviewCard.label}
    </span>
  );
  if (artifactMode === "qualitative" && record.qualitativeRecommendationLevel) {
    reviewLabel = (
      <button onClick={() => onOpenDetail(record, "ai-analysis")} type="button">
        <QualitativeRecommendationBadge level={record.qualitativeRecommendationLevel} />
      </button>
    );
  } else if (hasAiScoreDetail) {
    reviewLabel = (
      <ResumeAiScoreHoverCard
        className={cn("font-medium", REVIEW_ACTION_TONE_CLASS[reviewCard.tone])}
        recordId={record.id}
      >
        {reviewCard.label}
      </ResumeAiScoreHoverCard>
    );
  }

  return (
    <p
      className="mt-3 line-clamp-3 text-[13px] text-muted-foreground leading-[19px]"
      title={reviewSummaryTitle}
    >
      <IconSparkles
        aria-hidden
        className={cn(
          "mr-1 inline size-3.5 align-[-2px]",
          REVIEW_ACTION_TONE_CLASS[reviewCard.tone],
        )}
      />
      {reviewLabel}
      {replacementAttemptLabel ? ` · ${replacementAttemptLabel}` : null}
      {summary ? ` ${summary}` : null}
    </p>
  );
}
