import type { ReactNode } from "react";
import { describeResumeLibraryReviewCard } from "@app/shared/resume-review";
import type { ResumeReviewActionTone } from "@app/shared/resume-review";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import {
  QUALITATIVE_RECOMMENDATION_VERDICT_TONE,
  STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS,
  StudioListCardAiVerdictBadge,
  StudioListCardEvaluation,
  StudioListCardEvaluationFocus,
  StudioListCardEvaluationFocusSkeleton,
  StudioListCardEvaluationSkeleton,
} from "@/components/features/studio/studio-list-card-evaluation";
import { ResumeAiScoreHoverCard } from "./resume-ai-score-hover-card";
import type { ResumeLibraryCardProps } from "./resume-library-card.types";
import type { StudioListCardVerdictTone } from "@/components/features/studio/studio-list-card-evaluation";

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

/** 评语下方的摘录；AI 评价生成中且尚无摘录时用同高骨架占位。 */
function renderEvaluationFocus(
  record: ResumeLibraryListRecord,
  artifactMode: ResumeLibraryListRecord["resumeEvaluationArtifactMode"],
  muted: boolean,
): ReactNode {
  const isGenerating =
    record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing";
  const level = artifactMode === "qualitative" ? record.qualitativeRecommendationLevel : null;
  if (isGenerating && !(level && record.qualitativeResumeFocus)) {
    return <StudioListCardEvaluationFocusSkeleton />;
  }
  return level ? (
    <StudioListCardEvaluationFocus focus={record.qualitativeResumeFocus} muted={muted} />
  ) : null;
}

const REVIEW_ACTION_VERDICT_TONE = {
  danger: "danger",
  muted: "muted",
  success: "success",
  warning: "warning",
} satisfies Record<ResumeReviewActionTone, StudioListCardVerdictTone>;

function describeResumeLibraryReview(record: ResumeLibraryListRecord) {
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
  const tone =
    artifactMode === "qualitative" && record.qualitativeRecommendationLevel
      ? QUALITATIVE_RECOMMENDATION_VERDICT_TONE[record.qualitativeRecommendationLevel]
      : REVIEW_ACTION_VERDICT_TONE[reviewCard.tone];
  return { artifactMode, hasAiScoreDetail, replacementAttemptLabel, reviewCard, tone };
}

/** 标题行的 AI 结论徽标：等级 / 评分结论，重评中时追加状态。 */
export function ResumeLibraryReviewBadge({
  muted,
  record,
}: {
  muted?: boolean;
  record: ResumeLibraryListRecord;
}) {
  if (record.resumeParseStatus === "queued" || record.resumeParseStatus === "processing") {
    return null;
  }
  const { replacementAttemptLabel, reviewCard, tone } = describeResumeLibraryReview(record);
  return (
    <StudioListCardAiVerdictBadge
      label={
        replacementAttemptLabel
          ? `${reviewCard.label} · ${replacementAttemptLabel}`
          : reviewCard.label
      }
      muted={muted}
      tone={tone}
    />
  );
}

export function ResumeLibraryEvaluationSummary({
  className,
  muted = false,
  onOpenDetail,
  record,
  summary,
}: {
  className?: string;
  muted?: boolean;
  onOpenDetail: ResumeLibraryCardProps["onOpenDetail"];
  record: ResumeLibraryListRecord;
  summary: string | null;
}) {
  const { artifactMode, hasAiScoreDetail, replacementAttemptLabel, reviewCard } =
    describeResumeLibraryReview(record);
  const reviewSummaryTitle = buildResumeReviewSummaryTitle(
    reviewCard.label,
    replacementAttemptLabel,
    summary,
  );
  const summaryContent = summary || <span className="text-muted-foreground">暂无 AI 评语</span>;

  const focus = renderEvaluationFocus(record, artifactMode, muted);

  if (record.resumeParseStatus === "queued" || record.resumeParseStatus === "processing") {
    return <StudioListCardEvaluationSkeleton />;
  }

  return (
    <StudioListCardEvaluation className={className}>
      {hasAiScoreDetail ? (
        <p title={reviewSummaryTitle}>
          <ResumeAiScoreHoverCard
            className={cn("block w-full", STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS)}
            onClick={
              artifactMode === "qualitative" ? () => onOpenDetail(record, "ai-analysis") : undefined
            }
            recordId={record.id}
          >
            {summaryContent}
          </ResumeAiScoreHoverCard>
        </p>
      ) : (
        <p className={STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS} title={reviewSummaryTitle}>
          {summaryContent}
        </p>
      )}
      {focus}
    </StudioListCardEvaluation>
  );
}
