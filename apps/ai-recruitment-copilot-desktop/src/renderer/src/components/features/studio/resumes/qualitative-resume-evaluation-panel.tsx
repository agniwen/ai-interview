"use client";

import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
  QualitativeResumeEvaluationV2,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { qualitativeResumeEvaluationSchema } from "@arc/db-schema/qualitative-resume-evaluation";
import type {
  ResumeEvaluationFailureRecord,
  ResumeEvaluationHistoryRecord,
  ResumeLibraryDetail,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { resumeEvaluationNotice } from "./resume-library-evaluation-summary";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { fetchResumeEvaluationHistory } from "@/lib/client/studio-resumes";

import {
  QualitativeRecommendationIndicator,
  QUALITATIVE_RECOMMENDATION_LABEL,
} from "./qualitative-recommendation-indicator";
export {
  QualitativeRecommendationIndicator,
  QUALITATIVE_RECOMMENDATION_LABEL,
} from "./qualitative-recommendation-indicator";

const DIMENSION_ENTRIES = [
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

const BASIS_DESCRIPTIONS = {
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
  const dimensions = DIMENSION_ENTRIES.map(([key, label]) => {
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
        const dimensionKey = DIMENSION_ENTRIES.find(([key]) => key === point.key)?.[0];
        if (!dimensionKey) {
          return null;
        }
        const dimension = evaluation.dimensions[dimensionKey];
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="font-medium text-foreground">
              {point.label}：{QUALITATIVE_RECOMMENDATION_LABEL[dimension.level]}
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

type QualitativeDimensionEntry = (typeof DIMENSION_ENTRIES)[number];

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
              {BASIS_DESCRIPTIONS[dimension.basis]}
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
    DIMENSION_ENTRIES.slice(0, 2),
    DIMENSION_ENTRIES.slice(2, 4),
    DIMENSION_ENTRIES.slice(4, 6),
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
          <span className="text-muted-foreground text-xs">不推荐 · 待定 · 推荐 · 非常推荐</span>
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
              {new Date(item.createdAt).toLocaleString("zh-CN")}
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
              {new Date(item.createdAt).toLocaleString("zh-CN")}
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
  historicalResult,
}: {
  detail: ResumeLibraryDetail;
  slug: string;
  historicalResult?: ReactNode;
}) {
  const evaluation =
    detail.resumeEvaluationArtifactMode === "qualitative"
      ? detail.qualitativeResumeEvaluation
      : null;
  const historyQuery = useQuery({
    enabled: Boolean(detail.jobDescriptionId),
    queryFn: () => fetchResumeEvaluationHistory(slug, detail.id),
    queryKey: ["resume-evaluation-history", slug, detail.id, detail.resumeReviewStatus],
  });
  const activities = [
    ...(historyQuery.data?.records ?? [])
      .filter((item) => !item.isCurrent)
      .map((item) => ({ item, kind: "evaluation" as const })),
    ...(historyQuery.data?.failures ?? []).map((item) => ({ item, kind: "failure" as const })),
  ].toSorted((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt));
  const notice = resumeEvaluationNotice(detail);
  const hasResult = Boolean(evaluation || historicalResult);

  return (
    <section className="space-y-6">
      {notice ? (
        <output className="block rounded-md border bg-muted/30 px-3 py-2 text-sm">
          {notice}
          {detail.resumeReviewStatus === "failed" && detail.resumeReviewError
            ? ` ${detail.resumeReviewError}`
            : null}
        </output>
      ) : null}
      {evaluation ? <QualitativeEvaluationDetails evaluation={evaluation} /> : historicalResult}
      {!hasResult && !notice ? (
        <p className="rounded-lg border p-6 text-muted-foreground text-sm">
          {detail.jobDescriptionId ? "暂无 AI 评价。" : "请先为候选人关联岗位，再生成 AI 评价。"}
        </p>
      ) : null}
      {detail.jobDescriptionId && historyQuery.isPending ? (
        <output className="block text-muted-foreground text-sm">正在加载评价历史…</output>
      ) : null}
      {historyQuery.error ? (
        <div role="alert" className="flex items-center gap-3 text-destructive text-sm">
          <span>{historyQuery.error.message}</span>
          <Button
            onClick={() => {
              void historyQuery.refetch();
            }}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        </div>
      ) : null}
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
    </section>
  );
}
