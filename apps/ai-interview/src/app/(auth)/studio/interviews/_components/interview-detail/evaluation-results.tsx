import { Badge } from "@/components/ui/badge";
import { resolveRecommendationVariant } from "./helpers";

interface EvaluationQuestion {
  order?: number;
  question?: string;
  score?: number;
  maxScore?: number;
  assessment?: string;
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
        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm" key={key}>
          <p className="font-medium">{key}</p>
          <p className="mt-1 break-words text-muted-foreground leading-relaxed">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </p>
        </div>
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
export function EvaluationResults({ data }: { data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-muted-foreground text-sm">暂无结构化结果。</p>;
  }

  if (!isAgentEvaluation(data)) {
    return <KeyValueEntries entries={data} />;
  }

  return (
    <div className="space-y-3">
      {typeof data.overallScore === "number" && (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
          <span className="font-semibold text-2xl">{data.overallScore}</span>
          <span className="text-muted-foreground text-sm">/ 100</span>
          {data.recommendation && (
            <Badge className="ml-auto" variant={resolveRecommendationVariant(data.recommendation)}>
              {data.recommendation}
            </Badge>
          )}
        </div>
      )}
      {data.overallAssessment && (
        <p className="text-muted-foreground text-sm leading-relaxed">{data.overallAssessment}</p>
      )}
      {data.questions.length > 0 && (
        <div className="space-y-2">
          {data.questions.map((q, i) => (
            <div
              className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
              key={q.order ?? i}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium leading-relaxed">
                  {q.order === null || q.order === undefined ? "" : `${q.order}. `}
                  {q.question ?? "未知题目"}
                </p>
                <span className="shrink-0 font-semibold">
                  {q.score ?? "-"}
                  <span className="font-normal text-muted-foreground">/{q.maxScore ?? 10}</span>
                </span>
              </div>
              {q.assessment && (
                <p className="mt-1.5 text-muted-foreground leading-relaxed">{q.assessment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
