import { describeResumeLibraryReviewCard } from "@app/shared/resume-review";
import type { ResumeReviewActionTone } from "@app/shared/resume-review";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { Icon } from "@/components/ui/icon";
import { QualitativeRecommendationIndicator } from "./qualitative-recommendation-indicator";

export type ResumeEvaluationSummaryRecord = Pick<
  ResumeLibraryListRecord,
  | "resumeEvaluationArtifactMode"
  | "jobEvaluationMode"
  | "qualitativeRecommendationLevel"
  | "qualitativeResumeSummary"
  | "resumeSummary"
  | "resumeReviewStatus"
  | "resumeReviewBaseScore"
  | "resumeReviewNextStepAction"
  | "structuredCompositeScore"
  | "structuredGateStatus"
  | "structuredScoreGrade"
  | "jobDescriptionId"
>;

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
  record: ResumeEvaluationSummaryRecord,
): StructuredReviewCardDescription {
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

export function getResumeEvaluationMode(record: ResumeEvaluationSummaryRecord) {
  return record.resumeEvaluationArtifactMode ?? record.jobEvaluationMode;
}

export function resumeEvaluationNotice(record: ResumeEvaluationSummaryRecord) {
  const hasResult = Boolean(record.resumeEvaluationArtifactMode);
  const updating =
    record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing";
  if (updating) {
    return hasResult ? "正在重新评价，当前展示上一次已完成的结果。" : "正在生成 AI 评价…";
  }
  if (record.resumeReviewStatus === "failed") {
    return hasResult ? "重新评价失败，当前展示上一次已完成的结果。" : "AI 评价失败";
  }
  return null;
}

export function ResumeLibraryEvaluationSummary({
  record,
}: {
  record: ResumeEvaluationSummaryRecord;
}) {
  const mode = getResumeEvaluationMode(record);
  const qualitative = mode === "qualitative";
  const level = qualitative ? record.qualitativeRecommendationLevel : null;
  const summary = qualitative ? record.qualitativeResumeSummary : record.resumeSummary;
  const hasHistoricalResult = !qualitative && Boolean(record.resumeEvaluationArtifactMode);
  const description =
    mode === "structured"
      ? describeStructuredReviewCard(record)
      : describeResumeLibraryReviewCard({
          baseScore: record.resumeReviewBaseScore,
          nextStepAction: record.resumeReviewNextStepAction,
          status: hasHistoricalResult ? "ready" : record.resumeReviewStatus,
        });
  const notice = resumeEvaluationNotice(record);
  let indicator = (
    <span className="mr-2 text-muted-foreground text-xs">
      {record.jobDescriptionId ? "暂无 AI 评价" : "关联岗位后可生成 AI 评价"}
    </span>
  );
  if (level) {
    indicator = (
      <QualitativeRecommendationIndicator className="mr-2 align-baseline" level={level} />
    );
  } else if (hasHistoricalResult) {
    indicator = (
      <span
        className={`mr-2 inline-flex items-center gap-1 font-medium text-xs ${REVIEW_ACTION_TONE_CLASS[description.tone]}`}
      >
        <Icon className="size-3.5" icon="ph:sparkle" />
        历史评分 · {description.label}
      </span>
    );
  }
  return (
    <div className="mt-2 space-y-1" data-resume-evaluation-mode={mode}>
      <p className="line-clamp-3 text-[13px] leading-[19px]" title={summary || undefined}>
        {indicator}
        {summary ? <span className="text-muted-foreground">{summary}</span> : null}
      </p>
      {notice ? (
        <p className="truncate text-muted-foreground text-xs" title={notice}>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
