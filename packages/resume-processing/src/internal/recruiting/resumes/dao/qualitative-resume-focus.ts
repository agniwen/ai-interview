import { sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import type {
  QualitativeEvaluationSection,
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
} from "@app/db-schema/qualitative-resume-evaluation";
import { qualitativeResumeFocusSchema } from "@app/shared/qualitative-resume-focus";
import type { QualitativeResumeFocus } from "@app/shared/qualitative-resume-focus";

/** 列表卡片只做固定高度摘录，截断后下发，避免列表接口携带完整评价。 */
export const QUALITATIVE_RESUME_FOCUS_MAX_LENGTH = 400;
/** 卡片最多展示 4 条要点（每条两行），摘录区高度因此固定，虚拟列表行高可确定。 */
export const QUALITATIVE_RESUME_FOCUS_MAX_POINTS = 4;
const MATCHING_EVIDENCE_LEVELS = [
  "recommended",
  "highly_recommended",
] as const satisfies readonly QualitativeRecommendationLevel[];

type FocusPointKind = "matching" | "risk";
type QualitativeEvaluationPoints = Exclude<QualitativeEvaluationSection, string>;

function focusPoints(section: QualitativeEvaluationPoints, kind: FocusPointKind, count: number) {
  return section.slice(0, count).map((item) => ({
    content: item.content,
    jobRequirement: item.jobRequirement,
    kind,
    point: item.point,
    resumeEvidence: item.resumeEvidence,
  }));
}

/** 驱动可能返回已解析的 jsonb 对象或 JSON 文本，两种都在此校验。 */
const driverFocusSchema = z.union([
  qualitativeResumeFocusSchema,
  z
    .string()
    .transform((text, context) => {
      try {
        const json: unknown = JSON.parse(text);
        return json;
      } catch {
        context.addIssue({ code: "custom", message: "invalid focus json" });
        return z.NEVER;
      }
    })
    .pipe(qualitativeResumeFocusSchema),
]);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Drizzle mapWith passes the raw driver value.
function parseFocus(value: unknown): QualitativeResumeFocus | null {
  const parsed = driverFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * 卡片评语下方的摘录：推荐 / 非常推荐取“匹配依据”，待定 / 不推荐取“风险与待确认项”，最多 4 条；
 * V3 为带类型的结构化要点，V1/V2 为截断的 Markdown。
 * Picks the evaluation excerpt a list card shows under the overall summary.
 */
export function qualitativeResumeFocusSql(
  evaluation: SQLWrapper,
): SQL<QualitativeResumeFocus | null> {
  const levels = sql.raw(MATCHING_EVIDENCE_LEVELS.map((level) => `'${level}'`).join(", "));
  const isMatchingEvidence = sql`(${evaluation}->>'recommendationLevel' in (${levels}))`;
  const matching = sql`(${evaluation}->'detailedOverall'->'matchingEvidence')`;
  const risks = sql`(${evaluation}->'detailedOverall'->'risks')`;
  const section = sql`(case when ${isMatchingEvidence} then ${matching} else ${risks} end)`;
  const kind = sql`(case when ${isMatchingEvidence} then 'matching' else 'risk' end)`;
  return sql<QualitativeResumeFocus | null>`case
    when jsonb_typeof(${section}) = 'array' then jsonb_build_object(
      'format', 'points',
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'content', item.value->>'content',
            'jobRequirement', item.value->>'jobRequirement',
            'kind', ${kind},
            'point', item.value->>'point',
            'resumeEvidence', item.value->>'resumeEvidence'
          )
          order by item.ordinality
        )
        from jsonb_array_elements(${section}) with ordinality as item(value, ordinality)
        where item.ordinality <= ${sql.raw(String(QUALITATIVE_RESUME_FOCUS_MAX_POINTS))}
      ), '[]'::jsonb)
    )
    when jsonb_typeof(${section}) = 'string' then jsonb_build_object(
      'format', 'markdown',
      'text', left(${section} #>> '{}', ${sql.raw(String(QUALITATIVE_RESUME_FOCUS_MAX_LENGTH))})
    )
  end`.mapWith(parseFocus);
}

export function selectQualitativeResumeFocus(
  evaluation: QualitativeResumeEvaluation | null,
): QualitativeResumeFocus | null {
  if (!evaluation) {
    return null;
  }
  const isMatchingEvidence = MATCHING_EVIDENCE_LEVELS.some(
    (level) => level === evaluation.recommendationLevel,
  );
  const section = isMatchingEvidence
    ? evaluation.detailedOverall.matchingEvidence
    : evaluation.detailedOverall.risks;
  if (!Array.isArray(section)) {
    return { format: "markdown", text: section.slice(0, QUALITATIVE_RESUME_FOCUS_MAX_LENGTH) };
  }
  return {
    format: "points",
    items: focusPoints(
      section,
      isMatchingEvidence ? "matching" : "risk",
      QUALITATIVE_RESUME_FOCUS_MAX_POINTS,
    ),
  };
}
