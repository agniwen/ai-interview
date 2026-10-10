import type { HumanInterviewEvaluationDraft } from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewReviewRecord,
  HumanInterviewReviewerEvaluationRecord,
} from "@app/shared/studio-pipeline-stages";
import { IconChevronRight } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoundEvaluation } from "../studio/human-interview-evaluation-summary";

const tones = { fail: "danger", inconclusive: "warning", pass: "success" } as const;
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
    <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <div className="space-y-2 px-4 py-3">
        <output aria-label="本轮结论" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">本轮结论</span>
          {review.roundOutcome ? (
            <Badge variant={tones[review.roundOutcome]}>{labels[review.roundOutcome]}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">等待提交</span>
          )}
          {review.lockedOutcome ? (
            <span className="text-muted-foreground text-xs">已锁定 · 可继续补充评价</span>
          ) : null}
        </output>
        <p className="text-muted-foreground text-xs leading-5">
          每位面试官独立填写。首次提交通过或不通过即完成轮次，后续评价沿用结论；待定不锁定。
        </p>
      </div>
      {suggestion ? (
        <details className="group border-t border-border/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <IconChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            查看 AI 参考评价
          </summary>
          <div className="px-4 pb-4">
            <RoundEvaluation evaluation={suggestion} round={{ evaluationStatus: "draft" }} />
            {canAdopt ? (
              <Button variant="outline" size="sm" onClick={() => onAdopt(suggestion)}>
                使用 AI 建议作为我的草稿
              </Button>
            ) : null}
          </div>
        </details>
      ) : null}
      {review.reviewerEvaluations?.map((item) => (
        <details key={item.id} className="group border-t border-border/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="min-w-0 flex-1 truncate font-medium">{item.reviewerName}</span>
            {item.legacy ? <span className="text-muted-foreground text-xs">历史评价</span> : null}
            <Badge variant={item.submittedAt && item.outcome ? tones[item.outcome] : "outline"}>
              {statusLabel(item)}
            </Badge>
          </summary>
          <div className="px-4 pb-4">
            <RoundEvaluation
              evaluation={item.evaluation}
              round={{ evaluationStatus: item.submittedAt ? "submitted" : "draft" }}
            />
          </div>
        </details>
      ))}
    </div>
  );
}
