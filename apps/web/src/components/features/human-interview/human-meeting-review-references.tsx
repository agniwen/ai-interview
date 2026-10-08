import type { HumanInterviewEvaluationDraft } from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewReviewRecord,
  HumanInterviewReviewerEvaluationRecord,
} from "@app/shared/studio-pipeline-stages";
import { Button } from "@/components/ui/button";
import { RoundEvaluation } from "../studio/human-interview-evaluation-summary";

const labels = { fail: "不通过", inconclusive: "待定", pass: "通过" };
function statusLabel(item: HumanInterviewReviewerEvaluationRecord) {
  if (!item.submittedAt) {
    return "草稿";
  }
  return item.outcome ? labels[item.outcome] : "已提交";
}
export function HumanMeetingReviewReferences({
  review,
  canAdopt,
  onAdopt,
}: {
  review: HumanInterviewReviewRecord;
  canAdopt: boolean;
  onAdopt: (evaluation: HumanInterviewEvaluationDraft) => void;
}) {
  if (!review.personalEvaluation) {
    return null;
  }
  const suggestion = review.aiEvaluation;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-muted-foreground text-sm">
        每位面试官独立填写。首个正式提交的通过或不通过锁定本轮结论，后续评价自动沿用；待定不锁定。未全部提交时，不会因拒绝关闭招聘记录。
        {review.roundOutcome ? ` 当前汇总：${labels[review.roundOutcome]}。` : ""}
      </p>
      {suggestion ? (
        <details>
          <summary className="cursor-pointer text-sm">查看 AI 参考评价</summary>
          <RoundEvaluation evaluation={suggestion} round={{ evaluationStatus: "draft" }} />
          {canAdopt ? (
            <Button variant="outline" size="sm" onClick={() => onAdopt(suggestion)}>
              使用 AI 建议作为我的草稿
            </Button>
          ) : null}
        </details>
      ) : null}
      {review.reviewerEvaluations?.map((item) => (
        <details key={item.id}>
          <summary className="cursor-pointer text-sm">
            {item.reviewerName} · {statusLabel(item)}
            {item.legacy ? " · 历史评价" : ""}
          </summary>
          <RoundEvaluation
            evaluation={item.evaluation}
            round={{ evaluationStatus: item.submittedAt ? "submitted" : "draft" }}
          />
        </details>
      ))}
    </div>
  );
}
