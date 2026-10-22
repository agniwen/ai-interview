import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";
import {
  normalizeHumanInterviewEvaluationText,
  hasHumanInterviewEvaluationText,
} from "@app/shared/human-interview-evaluation";
import { cn } from "@app/shared/utils";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { IconAlertTriangle, IconSparkles } from "@tabler/icons-react";

const AI_EVALUATION_TAB = "ai-evaluation";

function EvaluationField({
  label,
  value,
  markdown = false,
}: {
  label: string;
  value: string;
  markdown?: boolean;
}) {
  if (!hasHumanInterviewEvaluationText(value)) {
    return null;
  }
  const displayValue = normalizeHumanInterviewEvaluationText(value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {markdown && value.trim() ? (
        <MarkdownView className="text-foreground/90 leading-relaxed" content={displayValue} />
      ) : (
        <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{displayValue}</p>
      )}
    </div>
  );
}

type ReviewFindings = NonNullable<HumanInterviewRoundRecord["aiEvaluationReviewFindings"]>;

function AiEvaluationReviewFindings({ findings }: { findings: ReviewFindings }) {
  return (
    <Alert role="note">
      <IconAlertTriangle aria-hidden />
      <AlertTitle>AI 证据复核未通过</AlertTitle>
      <AlertDescription>
        <p>以下表述未通过证据复核，采用或提交前请核对并修改：</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-4">
          {findings.map((finding) => (
            <li key={`${finding.quote}\u0000${finding.reason}`}>
              <q className="text-foreground/90">{finding.quote}</q>
              <span className="block">{finding.reason}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function SingleEvaluation({
  evaluation,
  round,
  className,
  compact = false,
  autoScrollDetails = true,
  hideTitle = false,
  aiGenerated = false,
  outcome,
  reviewFindings = [],
}: {
  evaluation: NonNullable<HumanInterviewRoundRecord["evaluation"]>;
  round: Pick<HumanInterviewRoundRecord, "evaluationStatus">;
  className?: string;
  compact?: boolean;
  autoScrollDetails?: boolean;
  hideTitle?: boolean;
  aiGenerated?: boolean;
  outcome?: HumanInterviewRoundRecord["outcome"];
  reviewFindings?: ReviewFindings;
}) {
  const submitted = round.evaluationStatus === "submitted";
  const statusLabel = {
    draft: "待提交",
    failed: "旧稿 · 生成失败",
    generating: "旧稿 · 重新生成中",
    not_started: "待提交",
    submitted: "已提交",
  }[round.evaluationStatus];
  const hasDetails = [evaluation.strengths, evaluation.risks, evaluation.detailedAnalysis].some(
    hasHumanInterviewEvaluationText,
  );
  const hasSummary = [
    evaluation.rating,
    evaluation.professionalSkill,
    evaluation.rolePosition,
    evaluation.salaryRecommendation,
  ].some(hasHumanInterviewEvaluationText);
  const details = hasDetails ? (
    <div className="flex flex-col gap-4">
      <EvaluationField label="优势特点" value={evaluation.strengths} />
      <EvaluationField label="劣势风险" value={evaluation.risks} />
      <EvaluationField label="完整详细分析" value={evaluation.detailedAnalysis} />
    </div>
  ) : null;
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-border/40 border-t pt-4 text-sm wrap-anywhere",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {hideTitle ? null : <span className="font-medium text-sm">面试评价</span>}
        {outcome ? (
          <Badge
            variant={
              ({ fail: "destructive", inconclusive: "warning", pass: "success" } as const)[outcome]
            }
          >
            {{ fail: "不通过", inconclusive: "待定", pass: "通过" }[outcome]}
          </Badge>
        ) : null}
        {aiGenerated ? (
          <span className="text-muted-foreground text-xs">AI 生成 · 仅供参考</span>
        ) : null}
        {!aiGenerated && submitted ? (
          <span className="text-muted-foreground text-xs">评价 · {statusLabel}</span>
        ) : null}
        {aiGenerated || submitted ? null : <Badge variant="warning">评价 · {statusLabel}</Badge>}
      </div>
      {reviewFindings.length > 0 ? <AiEvaluationReviewFindings findings={reviewFindings} /> : null}
      {hasSummary ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <EvaluationField label="评级" value={evaluation.rating ?? ""} />
          <EvaluationField label="专业技能" value={evaluation.professionalSkill} />
          <EvaluationField label="角色定位" value={evaluation.rolePosition} />
          <EvaluationField label="薪资建议" value={evaluation.salaryRecommendation} />
        </div>
      ) : null}
      <EvaluationField label="整体评价" value={evaluation.overallEvaluation} markdown />
      {compact && hasDetails ? (
        <InterviewReportDetailsDisclosure autoScroll={autoScrollDetails}>
          {details}
        </InterviewReportDetailsDisclosure>
      ) : (
        details
      )}
    </div>
  );
}

export function RoundEvaluation({
  evaluation,
  round,
  className,
  compact = false,
  autoScrollDetails = true,
}: {
  evaluation: NonNullable<HumanInterviewRoundRecord["evaluation"]>;
  round: Pick<
    HumanInterviewRoundRecord,
    "aiEvaluation" | "aiEvaluationReviewFindings" | "evaluationStatus" | "reviewerEvaluations"
  >;
  className?: string;
  compact?: boolean;
  autoScrollDetails?: boolean;
}) {
  const reviews = round.reviewerEvaluations ?? [];
  const aiReviewFindings = round.aiEvaluationReviewFindings ?? [];
  if (reviews.length === 0) {
    // Findings describe the AI snapshot, so hide them once the round draft has been edited.
    const showsAiDraft =
      round.aiEvaluation === evaluation ||
      (round.aiEvaluation !== null &&
        round.aiEvaluation !== undefined &&
        JSON.stringify(round.aiEvaluation) === JSON.stringify(evaluation));
    return (
      <SingleEvaluation
        evaluation={evaluation}
        round={round}
        reviewFindings={showsAiDraft ? aiReviewFindings : []}
        className={className}
        autoScrollDetails={autoScrollDetails}
        compact={compact}
      />
    );
  }
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 border-border/40 border-t pt-4 text-sm",
        className,
      )}
    >
      <h5 className="font-medium text-sm">面试评价</h5>
      <Tabs key={reviews.map((review) => review.id).join(":")} defaultValue={reviews[0].id}>
        <TabsList variant="underline" aria-label="按面试官查看评价">
          {reviews.map((review) => (
            <TabsTrigger key={review.id} value={review.id}>
              <Avatar className="size-4.5" seed={review.reviewerId ?? review.id} aria-hidden>
                {review.reviewerImage ? <AvatarImage src={review.reviewerImage} alt="" /> : null}
              </Avatar>
              {review.reviewerName}
            </TabsTrigger>
          ))}
          {round.aiEvaluation ? (
            <TabsTrigger value={AI_EVALUATION_TAB}>
              <IconSparkles className="size-4" aria-hidden />
              AI 评价
            </TabsTrigger>
          ) : null}
        </TabsList>
        {reviews.map((review) => (
          <TabsContent key={review.id} value={review.id} className="pt-3">
            <SingleEvaluation
              evaluation={review.evaluation}
              round={{ evaluationStatus: review.submittedAt ? "submitted" : "draft" }}
              outcome={review.outcome}
              className="border-t-0 pt-0"
              autoScrollDetails={autoScrollDetails}
              compact={compact}
              hideTitle
            />
          </TabsContent>
        ))}
        {round.aiEvaluation ? (
          <TabsContent value={AI_EVALUATION_TAB} className="pt-3">
            <SingleEvaluation
              evaluation={round.aiEvaluation}
              round={{ evaluationStatus: "submitted" }}
              className="border-t-0 pt-0"
              autoScrollDetails={autoScrollDetails}
              compact={compact}
              aiGenerated
              hideTitle
              reviewFindings={aiReviewFindings}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}
