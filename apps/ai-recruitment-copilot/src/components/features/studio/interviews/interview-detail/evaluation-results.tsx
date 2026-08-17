"use client";

import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveRecommendationVariant } from "./helpers";
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { parseInterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import type { InterviewQuestionOutcome } from "@arc/shared/interview/question-outcomes";

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

const QUESTION_STATUS_LABELS = {
  answered: "已回答",
  insufficient: "信息不足",
  interrupted: "已中断",
  skipped: "已跳过",
  unasked: "未提问",
} satisfies Record<InterviewQuestionOutcome["status"], string>;

const QUESTION_STATUS_VARIANTS = {
  answered: "secondary",
  insufficient: "outline",
  interrupted: "outline",
  skipped: "destructive",
  unasked: "outline",
} as const;

const REASON_LABELS = {
  candidate_ended_round: "候选人结束整轮",
  reconnect_grace_expired: "重连宽限期耗尽",
  system_shutdown: "系统终止",
  time_limit: "时间截止",
} as const;

/**
 * 兜底渲染：把任意键值对扁平展示。
 * Fallback renderer that flattens arbitrary key/value entries.
 */
function KeyValueEntries({ entries }: { entries: EvaluationPayload }) {
  const items = Object.entries(entries).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无结构化结果。</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(([key, value]) => (
        <div className="border-border/50 border-t pt-3 text-sm" key={key}>
          <p className="font-medium">{key}</p>
          <p className="mt-1 wrap-break-word text-muted-foreground leading-6">
            {z.string().safeParse(value).success ? String(value) : JSON.stringify(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

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

function OverallEvaluation({
  data,
  enabledCategories,
}: {
  data: AgentEvaluation;
  enabledCategories: Set<KeywordCategory>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-muted/60 bg-muted/30 px-4 py-3">
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
        <p className="text-muted-foreground text-sm leading-normal">
          <HighlightedText enabledCategories={enabledCategories} text={data.overallAssessment} />
        </p>
      ) : null}
    </div>
  );
}

function QuestionCoverageResults({
  data,
  enabledCategories,
  onEvidenceSelect,
  outcomes,
}: {
  data: AgentEvaluation;
  enabledCategories: Set<KeywordCategory>;
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
  outcomes: InterviewQuestionOutcome[];
}) {
  const evaluationById = new Map<string, AgentEvaluation["questions"][number]>();
  for (const question of data.questions) {
    if (question.questionId) {
      evaluationById.set(question.questionId, question);
    }
  }
  const scorableCount = outcomes.filter((outcome) =>
    ["answered", "insufficient", "skipped"].includes(outcome.status),
  ).length;
  const insufficientSample = scorableCount / outcomes.length < 0.5;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/70">
        {outcomes.map((outcome, index) => {
          const evaluation = evaluationById.get(outcome.questionId);
          const evidence = evaluation?.evidence ?? [];
          const firstEvidence = evidence.find((item) => item.quote);
          const duration = Math.max(0, Math.round(outcome.endedAtSecs - outcome.startedAtSecs));
          let evidenceLabel = "转写证据";
          if (outcome.status === "skipped") {
            evidenceLabel = "跳过依据";
          } else if (outcome.status === "interrupted") {
            evidenceLabel = "未完成上下文";
          }

          return (
            <article
              className={index === 0 ? "p-4" : "border-border/60 border-t p-4"}
              key={outcome.questionId}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Button
                    className="h-auto max-w-full justify-start whitespace-normal p-0 text-left font-medium leading-normal hover:bg-transparent"
                    disabled={!firstEvidence}
                    onClick={() => {
                      if (firstEvidence) {
                        onEvidenceSelect?.(firstEvidence);
                      }
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {outcome.question}
                  </Button>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                    <Badge variant={QUESTION_STATUS_VARIANTS[outcome.status]}>
                      {QUESTION_STATUS_LABELS[outcome.status]}
                    </Badge>
                    <span>追问 {outcome.followUpCount} 次</span>
                    <span>用时 {duration} 秒</span>
                    {outcome.reason ? <span>{REASON_LABELS[outcome.reason]}</span> : null}
                    <span className="ml-auto font-medium text-foreground tabular-nums">
                      {evaluation?.score !== null && evaluation?.score !== undefined
                        ? `${evaluation.score}/10`
                        : "不评分"}
                    </span>
                  </div>
                  {outcome.evaluationFocus ? (
                    <div className="mt-3 rounded-lg bg-muted/35 px-3 py-2">
                      <p className="font-medium text-foreground text-xs">考核意图</p>
                      <p className="mt-1 text-muted-foreground text-xs leading-5">
                        {outcome.evaluationFocus}
                      </p>
                    </div>
                  ) : null}
                  {evaluation?.assessment ? (
                    <p className="mt-3 text-muted-foreground text-sm leading-normal">
                      <HighlightedText
                        enabledCategories={enabledCategories}
                        text={evaluation.assessment}
                      />
                    </p>
                  ) : null}
                  {evidence.length > 0 && outcome.status !== "unasked" ? (
                    <div className="mt-3">
                      <p className="font-medium text-muted-foreground text-xs">{evidenceLabel}</p>
                      <EvidenceList
                        enabledCategories={enabledCategories}
                        evidence={evidence}
                        onEvidenceSelect={onEvidenceSelect}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {insufficientSample ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
          可评分题目少于必问题目的一半，当前结论为待定，评分仅供有限样本参考。
        </p>
      ) : null}
      <OverallEvaluation data={data} enabledCategories={enabledCategories} />
    </div>
  );
}

/**
 * 渲染 Agent 评估结果：识别"标准评估"格式（含 questions[]）则渲染富视图，
 * 否则降级为通用键值对展示。
 *
 * Render an agent evaluation: if the payload is the standard shape (with `questions[]`),
 * render the rich view; otherwise fall back to a generic key/value list.
 */
export function EvaluationResults({
  data,
  dataCollectionResults,
  onEvidenceSelect,
}: {
  data: EvaluationPayload;
  dataCollectionResults?: unknown;
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
  const { enabledCategories } = useKeywordHighlight();
  const parsedDataCollectionResults = parseInterviewDataCollectionResults(dataCollectionResults);
  const parsedEvaluation = agentEvaluationSchema.safeParse(data);
  if (parsedDataCollectionResults) {
    const evaluation = parsedEvaluation.success ? parsedEvaluation.data : { questions: [] };
    return (
      <QuestionCoverageResults
        data={evaluation}
        enabledCategories={enabledCategories}
        onEvidenceSelect={onEvidenceSelect}
        outcomes={parsedDataCollectionResults.questions}
      />
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return <p className="text-muted-foreground text-sm">暂无结构化结果。</p>;
  }

  if (!parsedEvaluation.success) {
    return <KeyValueEntries entries={data} />;
  }

  const evaluation = parsedEvaluation.data;

  return (
    <div className="space-y-3">
      {evaluation.overallScore !== null && evaluation.overallScore !== undefined && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border">
          <span className="font-medium text-2xl text-primary tabular-nums">
            {evaluation.overallScore}
          </span>
          <span className="text-muted-foreground text-sm">/ 100</span>
          {evaluation.recommendation && (
            <Badge
              className="ml-auto"
              variant={resolveRecommendationVariant(evaluation.recommendation)}
            >
              {evaluation.recommendation}
            </Badge>
          )}
        </div>
      )}
      {evaluation.overallAssessment && (
        <p className="text-muted-foreground text-sm leading-normal">
          <HighlightedText
            enabledCategories={enabledCategories}
            text={evaluation.overallAssessment}
          />
        </p>
      )}
      {evaluation.questions.length > 0 && (
        <div className="flex flex-col">
          {evaluation.questions.map((q) => (
            <div
              className="border-border/50 border-t py-3 text-sm"
              key={`${q.order ?? "unknown"}-${q.question ?? "unknown"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium leading-normal">
                  {q.order === null || q.order === undefined ? "" : `${q.order}. `}
                  {q.question ?? "未知题目"}
                </p>
                <span className="shrink-0 font-semibold">
                  {q.score ?? "-"}
                  <span className="font-normal text-muted-foreground">/{q.maxScore ?? 10}</span>
                </span>
              </div>
              {q.assessment && (
                <p className="mt-1.5 text-muted-foreground leading-normal">
                  <HighlightedText enabledCategories={enabledCategories} text={q.assessment} />
                </p>
              )}
              {Array.isArray(q.evidence) ? (
                <EvidenceList
                  enabledCategories={enabledCategories}
                  evidence={q.evidence}
                  onEvidenceSelect={onEvidenceSelect}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
