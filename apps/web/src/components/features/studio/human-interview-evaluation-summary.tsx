import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";
import {
  normalizeHumanInterviewEvaluationText,
  normalizeHumanInterviewProfessionalSkill,
} from "@app/shared/human-interview-evaluation";
import { cn } from "@app/shared/utils";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";
import { Badge } from "@/components/ui/badge";

function EvaluationField({ label, value }: { label: string; value: string }) {
  const displayValue = normalizeHumanInterviewEvaluationText(value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{displayValue}</p>
    </div>
  );
}

export function RoundEvaluation({
  evaluation,
  round,
  className,
  compact = false,
}: {
  evaluation: NonNullable<HumanInterviewRoundRecord["evaluation"]>;
  round: Pick<HumanInterviewRoundRecord, "evaluationStatus">;
  className?: string;
  compact?: boolean;
}) {
  const submitted = round.evaluationStatus === "submitted";
  const statusLabel = {
    draft: "待提交",
    failed: "旧稿 · 生成失败",
    generating: "旧稿 · 重新生成中",
    not_started: "待提交",
    submitted: "已提交",
  }[round.evaluationStatus];
  const details = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
        <EvaluationField label="评级" value={evaluation.rating} />
        <EvaluationField
          label="专业技能"
          value={normalizeHumanInterviewProfessionalSkill(evaluation.professionalSkill)}
        />
        <EvaluationField label="职级定位" value={evaluation.seniorityPosition} />
        <EvaluationField label="角色定位" value={evaluation.rolePosition} />
        <EvaluationField label="薪资建议" value={evaluation.salaryRecommendation} />
      </div>
      {compact ? null : <EvaluationField label="整体评价" value={evaluation.overallEvaluation} />}
      <EvaluationField label="优势特点" value={evaluation.strengths} />
      <EvaluationField label="劣势风险" value={evaluation.risks} />
      <EvaluationField label="完整详细分析" value={evaluation.detailedAnalysis} />
    </div>
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-border/40 border-t pt-4 text-sm wrap-anywhere",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">面试评价</span>
        {submitted ? (
          <span className="text-muted-foreground text-xs">评价 · {statusLabel}</span>
        ) : (
          <Badge variant="warning">评价 · {statusLabel}</Badge>
        )}
        {compact ? (
          <span className="text-muted-foreground text-xs">评级 · {evaluation.rating}</span>
        ) : null}
      </div>
      {compact ? <EvaluationField label="整体评价" value={evaluation.overallEvaluation} /> : null}
      {compact ? (
        <InterviewReportDetailsDisclosure>{details}</InterviewReportDetailsDisclosure>
      ) : (
        details
      )}
    </div>
  );
}
