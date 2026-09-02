"use client";

import { IconQuestionMark, IconSparkles, IconThumbUp, IconX } from "@tabler/icons-react";
import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
  QualitativeResumeEvaluationV2,
} from "@app/db-schema/qualitative-resume-evaluation";
import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import type {
  ResumeEvaluationFailureRecord,
  ResumeEvaluationHistoryRecord,
  ResumeLibraryDetail,
} from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export const QUALITATIVE_RECOMMENDATION_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

export const QUALITATIVE_RECOMMENDATION_TEXT_CLASS = {
  highly_recommended: "text-purple-700 dark:text-purple-300",
  not_recommended: "text-red-700 dark:text-red-300",
  recommended: "text-green-700 dark:text-green-300",
  undecided: "text-yellow-700 dark:text-yellow-300",
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

const DIMENSION_GROUP_DESKTOP_CORNER_CLASSES = [
  "lg:rounded-[2px] lg:rounded-tr-xl",
  "lg:rounded-[2px] lg:rounded-bl-xl",
  "lg:rounded-[2px] lg:rounded-br-xl",
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
): evaluation is QualitativeResumeEvaluationV2 {
  return evaluation.schemaVersion === 2;
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

function QualitativeDimensionGroup({
  className,
  entries,
  evaluation,
}: {
  className?: string;
  entries: readonly QualitativeDimensionEntry[];
  evaluation: QualitativeResumeEvaluation;
}) {
  return (
    <FramePanel
      className={cn("flex flex-col gap-4", className)}
      data-qualitative-dimension-group={entries.map(([key]) => key).join(",")}
    >
      {entries.map(([key, label], index) => {
        const dimension = evaluation.dimensions[key];
        return (
          <div className={cn(index > 0 && "border-border/50 border-t pt-4")} key={key}>
            <div
              className="flex items-start justify-between gap-3"
              data-qualitative-dimension-header={key}
            >
              <div className="font-medium text-sm">{label}</div>
              {"level" in dimension ? (
                <QualitativeRecommendationIndicator className="shrink-0" level={dimension.level} />
              ) : null}
            </div>
            <RestrictedMarkdownView
              className="mt-3 text-sm leading-6"
              content={dimension.evaluation}
            />
            <p
              className="mt-2 text-muted-foreground text-xs leading-5"
              data-qualitative-dimension-basis={dimension.basis}
            >
              {QUALITATIVE_BASIS_DESCRIPTIONS[dimension.basis]}
            </p>
          </div>
        );
      })}
    </FramePanel>
  );
}

export function QualitativeEvaluationDetails({
  evaluation,
  summaryAction,
}: {
  evaluation: QualitativeResumeEvaluation;
  summaryAction?: ReactNode;
}) {
  const dimensionGroups = [
    QUALITATIVE_DIMENSION_ENTRIES.slice(0, 2),
    QUALITATIVE_DIMENSION_ENTRIES.slice(2, 4),
    QUALITATIVE_DIMENSION_ENTRIES.slice(4, 6),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Frame>
        <FrameHeader className="justify-between gap-3">
          <FrameTitle>综合评价</FrameTitle>
          {summaryAction}
        </FrameHeader>
        <FramePanel>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">推荐建议</span>
              <QualitativeRecommendationIndicator level={evaluation.recommendationLevel} />
            </div>
            <h3 className="font-semibold text-base leading-7">{evaluation.conciseOverall}</h3>
            <div className="text-sm leading-6" data-qualitative-overall-judgment>
              <div className="mb-1 font-medium">判断</div>
              <RestrictedMarkdownView content={evaluation.detailedOverall.judgment} />
            </div>
            <div className="grid gap-5 md:grid-cols-2" data-qualitative-overall-supporting>
              <div className="text-sm leading-6">
                <div className="mb-1 font-medium">匹配依据</div>
                <RestrictedMarkdownView content={evaluation.detailedOverall.matchingEvidence} />
              </div>
              <div className="text-sm leading-6">
                <div className="mb-1 font-medium">风险与待确认项</div>
                <RestrictedMarkdownView content={evaluation.detailedOverall.risks} />
              </div>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader className="justify-between gap-3">
          <FrameTitle>六维评价</FrameTitle>
        </FrameHeader>
        <div className="grid gap-1 lg:grid-cols-2">
          <FramePanel
            className="flex min-w-0 items-center justify-center lg:rounded-[2px] lg:rounded-tl-xl"
            data-qualitative-radar-panel
          >
            <QualitativeDimensionRadar evaluation={evaluation} />
          </FramePanel>
          {dimensionGroups.map((entries, index) => (
            <QualitativeDimensionGroup
              className={DIMENSION_GROUP_DESKTOP_CORNER_CLASSES[index]}
              entries={entries}
              evaluation={evaluation}
              key={entries.map(([key]) => key).join("-")}
            />
          ))}
        </div>
      </Frame>

      {evaluation.seniorityRecommendation || evaluation.teamPositioning ? (
        <div className="grid gap-4 md:grid-cols-2">
          {evaluation.seniorityRecommendation ? (
            <Frame>
              <FrameHeader>
                <FrameTitle>职级建议</FrameTitle>
              </FrameHeader>
              <FramePanel className="flex flex-1 flex-col gap-2 text-sm leading-6">
                <p className="font-medium">{evaluation.seniorityRecommendation.level}</p>
                <RestrictedMarkdownView content={evaluation.seniorityRecommendation.rationale} />
              </FramePanel>
            </Frame>
          ) : null}
          {evaluation.teamPositioning ? (
            <Frame>
              <FrameHeader>
                <FrameTitle>团队定位</FrameTitle>
              </FrameHeader>
              <FramePanel className="flex flex-1 flex-col gap-2 text-sm leading-6">
                <p className="font-medium">{evaluation.teamPositioning.suggestion}</p>
                <RestrictedMarkdownView content={evaluation.teamPositioning.rationale} />
              </FramePanel>
            </Frame>
          ) : null}
        </div>
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
      <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 text-sm dark:text-red-300">
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
        <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
          正在重新评价，当前继续展示上一次已完成的结果。
        </p>
      ) : null}
      {detail.resumeReviewStatus === "failed" ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
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
