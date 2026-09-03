import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";
import {
  normalizeHumanInterviewEvaluationText,
  normalizeHumanInterviewProfessionalSkill,
} from "@app/shared/human-interview-evaluation";
import { cn } from "@app/shared/utils";
import { Badge } from "@/components/ui/badge";

function EvaluationField({ label, value }: { label: string; value: string }) {
  const displayValue = normalizeHumanInterviewEvaluationText(value);
  return (
    <div className="space-y-1">
      <span className="font-medium text-muted-foreground">{label}</span>
      <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{displayValue}</p>
    </div>
  );
}

export function RoundEvaluation({
  evaluation,
  round,
  className,
}: {
  evaluation: NonNullable<HumanInterviewRoundRecord["evaluation"]>;
  round: Pick<HumanInterviewRoundRecord, "evaluationStatus">;
  className?: string;
}) {
  const submitted = round.evaluationStatus === "submitted";
  const statusLabel = {
    draft: "待提交",
    failed: "旧稿 · 生成失败",
    generating: "旧稿 · 重新生成中",
    not_started: "待提交",
    submitted: "已提交",
  }[round.evaluationStatus];
  return (
    <div className={cn("space-y-3 border-border/40 border-t pt-3 text-xs", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={submitted ? "success" : "warning"}>评价 · {statusLabel}</Badge>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <EvaluationField label="评级" value={evaluation.rating} />
        <EvaluationField
          label="专业技能"
          value={normalizeHumanInterviewProfessionalSkill(evaluation.professionalSkill)}
        />
        <EvaluationField label="职级定位" value={evaluation.seniorityPosition} />
        <EvaluationField label="角色定位" value={evaluation.rolePosition} />
        <EvaluationField label="优势特点" value={evaluation.strengths} />
        <EvaluationField label="劣势风险" value={evaluation.risks} />
        <EvaluationField label="薪资建议" value={evaluation.salaryRecommendation} />
      </div>
      <EvaluationField label="整体评价" value={evaluation.overallEvaluation} />
      <EvaluationField label="完整详细分析" value={evaluation.detailedAnalysis} />
    </div>
  );
}
