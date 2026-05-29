import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveRecommendationVariant } from "./helpers";

export interface EvidenceQuote {
  quote?: string;
  timeInCallSecs?: number | null;
  turnIndex?: number | null;
}

interface EvaluationQuestion {
  order?: number;
  question?: string;
  score?: number;
  maxScore?: number;
  assessment?: string;
  evidence?: EvidenceQuote[];
}

/**
 * Agent 报告的结构化字段（与 Record<string, unknown> 兼容，便于 type guard 使用）。
 * Structured agent evaluation payload (compatible with Record<string, unknown> for guards).
 */
type AgentEvaluation = Record<string, unknown> & {
  questions: EvaluationQuestion[];
  overallScore?: number;
  overallAssessment?: string;
  recommendation?: string;
};

function isAgentEvaluation(data: Record<string, unknown>): data is AgentEvaluation {
  return Array.isArray(data.questions);
}

/**
 * 兜底渲染：把任意键值对扁平展示。
 * Fallback renderer that flattens arbitrary key/value entries.
 */
function KeyValueEntries({ entries }: { entries: Record<string, unknown> }) {
  const items = Object.entries(entries).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无结构化结果。</p>;
  }

  return (
    <div className="space-y-2">
      {items.map(([key, value]) => (
        <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm" key={key}>
          <p className="font-medium">{key}</p>
          <p className="mt-1 break-words text-muted-foreground leading-normal">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({
  evidence,
  onEvidenceSelect,
}: {
  evidence: EvidenceQuote[];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
  const items = evidence.filter((item) => item.quote);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {items.map((item, index) => (
        <Button
          className="h-auto justify-start gap-2 px-2 py-1.5 text-left font-normal leading-normal"
          key={`${item.turnIndex ?? "unknown"}-${index}`}
          onClick={() => onEvidenceSelect?.(item)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className="min-w-0 flex-1 truncate">“{item.quote}”</span>
          {typeof item.timeInCallSecs === "number" ? (
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {item.timeInCallSecs}s
            </span>
          ) : null}
        </Button>
      ))}
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
  onEvidenceSelect,
}: {
  data: Record<string, unknown>;
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-muted-foreground text-sm">暂无结构化结果。</p>;
  }

  if (!isAgentEvaluation(data)) {
    return <KeyValueEntries entries={data} />;
  }

  return (
    <div className="space-y-3">
      {typeof data.overallScore === "number" && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
          <span className="font-medium text-2xl text-primary tabular-nums">
            {data.overallScore}
          </span>
          <span className="text-muted-foreground text-sm">/ 100</span>
          {data.recommendation && (
            <Badge className="ml-auto" variant={resolveRecommendationVariant(data.recommendation)}>
              {data.recommendation}
            </Badge>
          )}
        </div>
      )}
      {data.overallAssessment && (
        <p className="text-muted-foreground text-sm leading-normal">{data.overallAssessment}</p>
      )}
      {data.questions.length > 0 && (
        <div className="space-y-2">
          {data.questions.map((q, i) => (
            <div
              className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm"
              key={q.order ?? i}
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
                <p className="mt-1.5 text-muted-foreground leading-normal">{q.assessment}</p>
              )}
              {Array.isArray(q.evidence) ? (
                <EvidenceList evidence={q.evidence} onEvidenceSelect={onEvidenceSelect} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
