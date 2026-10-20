"use client";

import {
  IconChevronDown,
  IconQuestionMark,
  IconSparkles,
  IconThumbUp,
  IconX,
} from "@tabler/icons-react";
import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
  QualitativeResumeEvaluationWithDimensionLevels,
} from "@app/db-schema/qualitative-resume-evaluation";
import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import type {
  ResumeEvaluationFailureRecord,
  ResumeEvaluationHistoryRecord,
  ResumeLibraryDetail,
} from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QualitativeEvaluationPointsView } from "@/components/features/resume/qualitative-evaluation-points";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export const QUALITATIVE_RECOMMENDATION_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const QUALITATIVE_RECOMMENDATION_TEXT_CLASS = {
  highly_recommended: "text-purple-ink",
  not_recommended: "text-red-ink",
  recommended: "text-green-ink",
  undecided: "text-amber-ink",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const LEVEL_META = {
  highly_recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.highly_recommended,
    icon: IconSparkles,
    label: QUALITATIVE_RECOMMENDATION_LABEL.highly_recommended,
  },
  not_recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.not_recommended,
    icon: IconX,
    label: QUALITATIVE_RECOMMENDATION_LABEL.not_recommended,
  },
  recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.recommended,
    icon: IconThumbUp,
    label: QUALITATIVE_RECOMMENDATION_LABEL.recommended,
  },
  undecided: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.undecided,
    icon: IconQuestionMark,
    label: QUALITATIVE_RECOMMENDATION_LABEL.undecided,
  },
} as const;

export const QUALITATIVE_DIMENSION_ENTRIES = [
  ["skillMatch", "技能匹配"],
  ["experienceRelevance", "经验相关性"],
  ["projectMatch", "项目匹配"],
  ["educationBackground", "教育与背景"],
  ["potential", "潜力"],
  ["stability", "稳定性"],
] as const;

export const QUALITATIVE_BASIS_DESCRIPTIONS = {
  both: "根据岗位要求和通用职业标准分析得出",
  general: "根据通用职业标准分析得出",
  job: "根据岗位要求分析得出",
} as const;

const LEVEL_RADAR_VALUE = {
  highly_recommended: 4,
  not_recommended: 1,
  recommended: 3,
  undecided: 2,
} as const satisfies Record<QualitativeRecommendationLevel, number>;

export function QualitativeRecommendationIndicator({
  level,
  className,
}: {
  level: QualitativeRecommendationLevel;
  className?: string;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium text-xs leading-none",
        meta.className,
        className,
      )}
      data-qualitative-recommendation={level}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}

function hasDimensionLevels(
  evaluation: QualitativeResumeEvaluation,
): evaluation is QualitativeResumeEvaluationWithDimensionLevels {
  return evaluation.schemaVersion !== 1;
}

export function QualitativeDimensionRadar({
  compact = false,
  evaluation,
}: {
  compact?: boolean;
  evaluation: QualitativeResumeEvaluation;
}) {
  if (!hasDimensionLevels(evaluation)) {
    return (
      <p className="flex min-h-48 items-center justify-center text-center text-muted-foreground text-sm leading-6">
        此结果生成于六维评级引入前，重新评价后可查看六维图表。
      </p>
    );
  }
  const dimensions = QUALITATIVE_DIMENSION_ENTRIES.map(([key, label]) => {
    const dimension = evaluation.dimensions[key];
    return {
      key,
      label,
      rationale: dimension.evaluation,
      score: LEVEL_RADAR_VALUE[dimension.level],
    };
  });

  return (
    <DimensionRadarChart
      ariaLabel="简历六维定性评价雷达图"
      compact={compact}
      dimensions={dimensions}
      maxScore={4}
      tooltipBody={(point) => {
        const dimensionKey = QUALITATIVE_DIMENSION_ENTRIES.find(([key]) => key === point.key)?.[0];
        if (!dimensionKey) {
          return null;
        }
        const dimension = evaluation.dimensions[dimensionKey];
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="font-medium text-foreground">
              {point.label}：{LEVEL_META[dimension.level].label}
            </div>
            <RestrictedMarkdownView
              className="line-clamp-3 text-xs leading-5"
              content={dimension.evaluation}
            />
          </div>
        );
      }}
    />
  );
}

type QualitativeDimensionEntry = (typeof QUALITATIVE_DIMENSION_ENTRIES)[number];

const LEVEL_SURFACE_CLASS = {
  highly_recommended: "bg-purple-tint",
  not_recommended: "bg-red-tint",
  recommended: "bg-green-tint",
  undecided: "bg-amber-tint",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const RECOMMENDATION_BADGE_SIZE_CLASS = {
  default: "gap-1.5 px-2.5 py-1 text-sm [&_svg]:size-4",
  sm: "gap-1 px-2 py-0.5 text-xs [&_svg]:size-3.5",
} as const;

/** 综合推荐等级徽标：等级色文字 + 同色浅底 + 图标，用于展示整体评价结论（维度等级仍用文字指示）。 */
export function QualitativeRecommendationBadge({
  className,
  level,
  size = "default",
}: {
  className?: string;
  level: QualitativeRecommendationLevel;
  size?: keyof typeof RECOMMENDATION_BADGE_SIZE_CLASS;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-lg font-medium",
        RECOMMENDATION_BADGE_SIZE_CLASS[size],
        meta.className,
        LEVEL_SURFACE_CLASS[level],
        className,
      )}
      data-qualitative-recommendation={level}
    >
      <Icon aria-hidden="true" className="shrink-0" />
      {meta.label}
    </span>
  );
}

const LEVEL_METER_FILL_CLASS = {
  highly_recommended: "bg-purple",
  not_recommended: "bg-red",
  recommended: "bg-green",
  undecided: "bg-amber",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const LEVEL_METER_SEGMENTS = [1, 2, 3, 4] as const;
const MARKDOWN_DECORATION_PATTERN = /[*_`#>]+|^\s*(?:[-+]|\d+\.)\s+/gm;
const WHITESPACE_PATTERN = /\s+/g;

/** 一览行只展示纯文本摘要；完整评价展开后仍走受限 Markdown。 */
function toPlainSummary(markdown: string) {
  return markdown.replace(MARKDOWN_DECORATION_PATTERN, "").replace(WHITESPACE_PATTERN, " ").trim();
}

function QualitativeLevelMeter({ level }: { level: QualitativeRecommendationLevel }) {
  const filled = LEVEL_RADAR_VALUE[level];
  return (
    <span aria-hidden="true" className="flex items-center gap-0.5">
      {LEVEL_METER_SEGMENTS.map((segment) => (
        <span
          className={cn(
            "h-1.5 w-4 rounded-full",
            segment <= filled ? LEVEL_METER_FILL_CLASS[level] : "bg-muted-foreground/15",
          )}
          key={segment}
        />
      ))}
    </span>
  );
}

function QualitativeDimensionRow({
  entry: [key, label],
  evaluation,
}: {
  entry: QualitativeDimensionEntry;
  evaluation: QualitativeResumeEvaluation;
}) {
  const [open, setOpen] = useState(false);
  const dimension = evaluation.dimensions[key];
  const level = "level" in dimension ? dimension.level : null;
  return (
    <Collapsible
      className="border-border/50 border-b last:border-b-0"
      data-qualitative-dimension-item={key}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        aria-label={`${label}${level ? `：${LEVEL_META[level].label}` : ""}，${open ? "收起" : "展开"}详细评价`}
        className="group/dimension grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-md py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid-cols-[6.5rem_9.5rem_minmax(0,1fr)_auto]"
        data-qualitative-dimension-header={key}
      >
        <span className="font-medium text-sm">{label}</span>
        <span className="flex items-center gap-2 max-sm:hidden">
          {level ? (
            <>
              <QualitativeLevelMeter level={level} />
              <span className={cn("text-xs", LEVEL_META[level].className)}>
                {LEVEL_META[level].label}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </span>
        <span className="truncate text-muted-foreground text-sm">
          {toPlainSummary(dimension.evaluation)}
        </span>
        <IconChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 text-muted-foreground/60 transition-transform duration-[var(--duration-fast)] group-hover/dimension:text-foreground motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pb-5 sm:pl-[calc(6.5rem+1rem)]">
          {level ? (
            <QualitativeRecommendationIndicator className="sm:hidden" level={level} />
          ) : null}
          <RestrictedMarkdownView className="text-sm leading-7" content={dimension.evaluation} />
          <p
            className="text-muted-foreground/70 text-xs leading-5"
            data-qualitative-dimension-basis={dimension.basis}
          >
            {QUALITATIVE_BASIS_DESCRIPTIONS[dimension.basis]}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const SECTION_TITLE_CLASS = "font-medium text-sm";
const SUBSECTION_LABEL_CLASS = "mb-4 text-muted-foreground text-xs";

function QualitativeDimensionsSection({ evaluation }: { evaluation: QualitativeResumeEvaluation }) {
  return (
    <section className="border-border/50 border-t pt-8">
      <h3 className={SUBSECTION_LABEL_CLASS}>六维评价</h3>
      {hasDimensionLevels(evaluation) ? null : (
        <p className="mb-2 text-muted-foreground/70 text-xs">
          此结果生成于六维评级引入前，重新评价后可查看六维评级。
        </p>
      )}
      <div className="-mt-3 flex flex-col">
        {QUALITATIVE_DIMENSION_ENTRIES.map((entry) => (
          <QualitativeDimensionRow entry={entry} evaluation={evaluation} key={entry[0]} />
        ))}
      </div>
    </section>
  );
}

export function QualitativeEvaluationDetails({
  evaluation,
  summaryAction,
}: {
  evaluation: QualitativeResumeEvaluation;
  summaryAction?: ReactNode;
}) {
  const appendixItems = [
    evaluation.seniorityRecommendation
      ? {
          label: "职级建议",
          rationale: evaluation.seniorityRecommendation.rationale,
          value: evaluation.seniorityRecommendation.level,
        }
      : null,
    evaluation.teamPositioning
      ? {
          label: "团队定位",
          rationale: evaluation.teamPositioning.rationale,
          value: evaluation.teamPositioning.suggestion,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className={SECTION_TITLE_CLASS}>综合评价</h3>
          {summaryAction}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <QualitativeRecommendationBadge level={evaluation.recommendationLevel} />
          <p className="font-semibold text-xl leading-9 tracking-tight">
            {evaluation.conciseOverall}
          </p>
          <div
            className="text-muted-foreground text-sm leading-7"
            data-qualitative-overall-judgment
          >
            <RestrictedMarkdownView content={evaluation.detailedOverall.judgment} />
          </div>
        </div>
      </section>

      <section
        className="grid gap-x-12 gap-y-10 border-border/50 border-t pt-8 text-sm leading-6 lg:grid-cols-2"
        data-qualitative-overall-supporting
      >
        <div className="min-w-0">
          <h3 className={SUBSECTION_LABEL_CLASS}>匹配依据</h3>
          <QualitativeEvaluationPointsView
            kind="matching"
            section={evaluation.detailedOverall.matchingEvidence}
          />
        </div>
        <div className="min-w-0 lg:border-border/50 lg:border-l lg:pl-8">
          <h3 className={SUBSECTION_LABEL_CLASS}>风险与待确认项</h3>
          <QualitativeEvaluationPointsView kind="risk" section={evaluation.detailedOverall.risks} />
        </div>
      </section>

      <QualitativeDimensionsSection evaluation={evaluation} />

      {appendixItems.length > 0 ? (
        <dl className="flex flex-col gap-5 border-border/50 border-t pt-8 text-sm leading-6">
          {appendixItems.map((item) => (
            <div
              className="grid gap-1 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-4"
              key={item.label}
            >
              <dt className="text-muted-foreground text-xs leading-6">{item.label}</dt>
              <dd className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{item.value}</span>
                <RestrictedMarkdownView
                  className="text-muted-foreground"
                  content={item.rationale}
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function historyTypeLabel(contractVersion: string) {
  if (contractVersion.startsWith("qualitative-v")) {
    return "六维定性评价";
  }
  if (contractVersion.startsWith("structured-")) {
    return "历史结构化评分";
  }
  return "历史评分";
}

function EvaluationHistoryItem({ item }: { item: ResumeEvaluationHistoryRecord }) {
  const qualitative = qualitativeResumeEvaluationSchema.safeParse(item.artifact);
  let statusIndicator: ReactNode = (
    <Badge variant="outline">{historyTypeLabel(item.contractVersion)}</Badge>
  );
  if (item.recommendationLevel) {
    statusIndicator = <QualitativeRecommendationIndicator level={item.recommendationLevel} />;
  }
  let content: ReactNode = (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
      {JSON.stringify(item.artifact, null, 2)}
    </pre>
  );
  if (qualitative.success) {
    content = <QualitativeEvaluationDetails evaluation={qualitative.data} />;
  }
  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary aria-label="展开完整历史评价" className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {statusIndicator}
            <span className="text-muted-foreground">{historyTypeLabel(item.contractVersion)}</span>
            {item.numericScore === null ? null : <span>{item.numericScore} 分</span>}
            <span className="text-muted-foreground">
              {item.jobDescriptionVersion === null
                ? "JD 版本不可追溯"
                : `JD v${item.jobDescriptionVersion}`}
            </span>
            <span className="text-muted-foreground">
              <LocalDateTimeText value={item.createdAt} />
            </span>
          </div>
          <span className="text-muted-foreground">展开完整结果</span>
        </div>
      </summary>
      <div className="mt-4">{content}</div>
    </details>
  );
}

function EvaluationFailureItem({ item }: { item: ResumeEvaluationFailureRecord }) {
  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary aria-label="展开评价失败详情" className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">评价失败</Badge>
            <span className="text-muted-foreground">{historyTypeLabel(item.contractVersion)}</span>
            <span className="text-muted-foreground">
              {item.jobDescriptionVersion === null
                ? "JD 版本不可追溯"
                : `JD v${item.jobDescriptionVersion}`}
            </span>
            <span className="text-muted-foreground">
              <LocalDateTimeText value={item.createdAt} />
            </span>
          </div>
          <span className="text-muted-foreground">展开失败原因</span>
        </div>
      </summary>
      <p className="mt-4 rounded-md border border-red-line bg-red-tint px-3 py-2 text-red-ink text-sm">
        {item.errorMessage}
      </p>
    </details>
  );
}

export function QualitativeResumeEvaluationPanel({
  detail,
  slug,
  summaryAction,
}: {
  detail: ResumeLibraryDetail;
  slug: string;
  summaryAction?: ReactNode;
}) {
  const evaluation = detail.qualitativeResumeEvaluation;
  const { data } = useQuery({
    enabled: Boolean(detail.jobDescriptionId),
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.resumes[":id"]["evaluation-history"].$get({
          param: { id: detail.id, slug },
        }),
        "加载评价历史失败",
      ),
    queryKey: ["resume-evaluation-history", slug, detail.id],
  });
  const history = data?.records ?? [];
  const failures = data?.failures ?? [];
  const activities = [
    ...history.map((item) => ({ item, kind: "evaluation" as const })),
    ...failures.map((item) => ({ item, kind: "failure" as const })),
  ].toSorted((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt));

  if (!detail.jobDescriptionId) {
    return (
      <p className="rounded-lg border p-6 text-muted-foreground text-sm">
        请先为候选人关联岗位，再生成 AI 评价。
      </p>
    );
  }
  if (!evaluation) {
    const isGenerating =
      detail.resumeReviewStatus === "queued" || detail.resumeReviewStatus === "processing";
    let message = "暂无 AI 评价。";
    if (isGenerating) {
      message = "正在生成 AI 评价，完成后会在这里展示。";
    } else if (detail.resumeReviewStatus === "failed") {
      message = detail.resumeReviewError || "AI 评价失败";
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-6">
          <p className="text-muted-foreground text-sm">{message}</p>
          {summaryAction}
        </div>
        {activities.length > 0 ? (
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium text-sm">
              历史评价（{activities.length}）
            </summary>
            <div className="mt-4 space-y-3">
              {activities.map(({ item, kind }) =>
                kind === "evaluation" ? (
                  <EvaluationHistoryItem item={item} key={item.id} />
                ) : (
                  <EvaluationFailureItem item={item} key={item.id} />
                ),
              )}
            </div>
          </details>
        ) : null}
      </div>
    );
  }
  const isUpdating =
    detail.resumeReviewStatus === "queued" || detail.resumeReviewStatus === "processing";
  const previousActivities = activities.filter(
    (activity) => activity.kind === "failure" || !activity.item.isCurrent,
  );

  return (
    <section className="space-y-6">
      {isUpdating ? (
        <p className="rounded-md border border-amber-line bg-amber-tint px-3 py-2 text-sm text-amber-ink">
          正在重新评价，当前继续展示上一次已完成的结果。
        </p>
      ) : null}
      {detail.resumeReviewStatus === "failed" ? (
        <p className="rounded-md border border-red-line bg-red-tint px-3 py-2 text-sm text-red-ink">
          {detail.resumeReviewError || "重新评价失败"}，当前继续展示上一次已完成的结果。
        </p>
      ) : null}
      <QualitativeEvaluationDetails evaluation={evaluation} summaryAction={summaryAction} />
      {previousActivities.length > 0 ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium text-sm">
            历史评价（{previousActivities.length}）
          </summary>
          <div className="mt-4 space-y-3">
            {previousActivities.map(({ item, kind }) =>
              kind === "evaluation" ? (
                <EvaluationHistoryItem item={item} key={item.id} />
              ) : (
                <EvaluationFailureItem item={item} key={item.id} />
              ),
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}
