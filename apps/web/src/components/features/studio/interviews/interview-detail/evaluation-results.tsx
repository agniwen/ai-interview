"use client";

import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveRecommendationVariant } from "./helpers";
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
import type { KeywordCategory } from "@app/shared/answer-keywords";
import type { InterviewQuestionOutcome } from "@app/shared/interview/question-outcomes";

const evidenceQuoteSchema = z.object({
  quote: z.string().optional(),
  timeInCallSecs: z.number().nullable().optional(),
  turnIndex: z.number().nullable().optional(),
});
export type EvidenceQuote = z.infer<typeof evidenceQuoteSchema>;

/**
 * Agent 报告的结构化字段（与 Record<string, unknown> 兼容，便于 type guard 使用）。
 * Structured agent evaluation payload (compatible with Record<string, unknown> for guards).
 */
const agentEvaluationSchema = z.object({
  overallAssessment: z.string().optional(),
  overallScore: z.number().nullable().optional(),
  questions: z.array(
    z.object({
      assessment: z.string().optional(),
      evidence: z.array(evidenceQuoteSchema).optional(),
      maxScore: z.number().optional(),
      order: z.number().optional(),
      question: z.string().optional(),
      questionId: z.string().optional(),
      score: z.number().nullable().optional(),
    }),
  ),
  recommendation: z.string().optional(),
});
type AgentEvaluation = z.infer<typeof agentEvaluationSchema>;
export const evaluationPayloadSchema = z.record(z.string(), z.json());
type EvaluationPayload = z.infer<typeof evaluationPayloadSchema>;

export function EvidenceList({
  enabledCategories,
  evidence,
  onEvidenceSelect,
}: {
  enabledCategories: Set<KeywordCategory>;
  evidence: EvidenceQuote[];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
  const items = evidence.filter((item) => item.quote);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {items.map((item) => (
        <Button
          className="h-auto justify-start gap-2 px-2 py-1.5 text-left font-normal leading-normal"
          key={`${item.turnIndex ?? "unknown"}-${item.timeInCallSecs ?? "unknown"}-${item.quote}`}
          onClick={() => onEvidenceSelect?.(item)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 flex-1 truncate">
            “
            <HighlightedText
              className="whitespace-normal"
              enabledCategories={enabledCategories}
              text={item.quote ?? ""}
            />
            ”
          </span>
          {item.timeInCallSecs !== null && item.timeInCallSecs !== undefined ? (
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {item.timeInCallSecs}s
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}

// 可评分题目不足必问题目的一半时，整体结论只能作有限参考。
// With fewer than half of the questions scorable, the overall verdict is only a limited sample.
function isInsufficientSample(outcomes: InterviewQuestionOutcome[]) {
  const scorableCount = outcomes.filter((outcome) =>
    ["answered", "insufficient", "skipped"].includes(outcome.status),
  ).length;
  return scorableCount / outcomes.length < 0.5;
}

function InsufficientSampleNote() {
  return (
    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
      可评分题目少于必问题目的一半，当前结论为待定，评分仅供有限样本参考。
    </p>
  );
}

function OverallEvaluation({
  data,
  enabledCategories,
}: {
  data: AgentEvaluation;
  enabledCategories: Set<KeywordCategory>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-medium text-2xl text-primary tabular-nums">
          {data.overallScore ?? "—"}
        </span>
        <span className="text-muted-foreground text-sm">/ 100</span>
        {data.recommendation ? (
          <Badge className="ml-auto" variant={resolveRecommendationVariant(data.recommendation)}>
            {data.recommendation}
          </Badge>
        ) : null}
      </div>
      {data.overallAssessment ? (
        <p className="text-foreground text-sm leading-6">
          <HighlightedText enabledCategories={enabledCategories} text={data.overallAssessment} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * 解析整体评分与评价；没有任何可展示内容时返回 null。
 * Resolve the overall score and assessment; null when there is nothing to show.
 */
export function resolveEvaluationOverall(
  data: EvaluationPayload,
  outcomes: InterviewQuestionOutcome[] | null,
) {
  const parsedEvaluation = agentEvaluationSchema.safeParse(data);
  if (!parsedEvaluation.success) {
    return null;
  }
  const evaluation = parsedEvaluation.data;
  const insufficientSample = outcomes ? isInsufficientSample(outcomes) : false;
  const hasOverall =
    (evaluation.overallScore !== null && evaluation.overallScore !== undefined) ||
    Boolean(evaluation.recommendation) ||
    Boolean(evaluation.overallAssessment);
  return hasOverall || insufficientSample ? { evaluation, insufficientSample } : null;
}

export function EvaluationOverall({
  overall,
}: {
  overall: NonNullable<ReturnType<typeof resolveEvaluationOverall>>;
}) {
  const { enabledCategories } = useKeywordHighlight();
  return (
    <div className="space-y-3">
      {overall.insufficientSample ? <InsufficientSampleNote /> : null}
      <OverallEvaluation data={overall.evaluation} enabledCategories={enabledCategories} />
    </div>
  );
}
