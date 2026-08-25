"use client";

import { IconQuestionMark, IconSparkles, IconThumbUp, IconX } from "@tabler/icons-react";
import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluationV1,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { qualitativeResumeEvaluationV1Schema } from "@arc/db-schema/qualitative-resume-evaluation";
import type {
  ResumeEvaluationFailureRecord,
  ResumeEvaluationHistoryRecord,
  ResumeLibraryDetail,
} from "@arc/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

const LEVEL_META = {
  highly_recommended: {
    className: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    icon: IconSparkles,
    label: "非常推荐",
  },
  not_recommended: {
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    icon: IconX,
    label: "不推荐",
  },
  recommended: {
    className: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
    icon: IconThumbUp,
    label: "推荐",
  },
  undecided: {
    className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    icon: IconQuestionMark,
    label: "待定",
  },
} as const;

const DIMENSION_ENTRIES = [
  ["skillMatch", "技能匹配"],
  ["experienceRelevance", "经验相关性"],
  ["projectMatch", "项目匹配"],
  ["educationBackground", "教育与背景"],
  ["potential", "潜力"],
  ["stability", "稳定性"],
] as const;

const BASIS_LABELS = {
  both: "岗位要求 + 通用标准",
  general: "通用职业标准",
  job: "岗位要求",
} as const;

export function QualitativeRecommendationBadge({
  level,
  className = "",
}: {
  level: QualitativeRecommendationLevel;
  className?: string;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <Badge className={`${meta.className} ${className}`} variant="outline">
      <Icon className="size-3.5" />
      {meta.label}
    </Badge>
  );
}

function EvaluationDetails({ evaluation }: { evaluation: QualitativeResumeEvaluationV1 }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">综合评价详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6">
          <div>
            <div className="mb-1 font-medium">判断</div>
            <p className="text-muted-foreground">{evaluation.detailedOverall.judgment}</p>
          </div>
          <div>
            <div className="mb-1 font-medium">匹配依据</div>
            <p className="text-muted-foreground">{evaluation.detailedOverall.matchingEvidence}</p>
          </div>
          <div>
            <div className="mb-1 font-medium">风险与待确认项</div>
            <p className="text-muted-foreground">{evaluation.detailedOverall.risks}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {DIMENSION_ENTRIES.map(([key, label]) => {
          const dimension = evaluation.dimensions[key];
          return (
            <Card key={key}>
              <CardHeader className="gap-2">
                <CardTitle className="text-base">{label}</CardTitle>
                <Badge className="w-fit" variant="secondary">
                  {BASIS_LABELS[dimension.basis]}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-6">{dimension.evaluation}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {evaluation.seniorityRecommendation || evaluation.teamPositioning ? (
        <div className="grid gap-4 md:grid-cols-2">
          {evaluation.seniorityRecommendation ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">职级建议</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6">
                <p className="font-medium">{evaluation.seniorityRecommendation.level}</p>
                <p className="text-muted-foreground">
                  {evaluation.seniorityRecommendation.rationale}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {evaluation.teamPositioning ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">团队定位</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6">
                <p className="font-medium">{evaluation.teamPositioning.suggestion}</p>
                <p className="text-muted-foreground">{evaluation.teamPositioning.rationale}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function historyTypeLabel(contractVersion: string) {
  if (contractVersion === "qualitative-v1") {
    return "六维定性评价";
  }
  if (contractVersion.startsWith("structured-")) {
    return "历史结构化评分";
  }
  return "历史评分";
}

function EvaluationHistoryItem({ item }: { item: ResumeEvaluationHistoryRecord }) {
  const qualitative = qualitativeResumeEvaluationV1Schema.safeParse(item.artifact);
  let statusBadge: ReactNode = (
    <Badge variant="outline">{historyTypeLabel(item.contractVersion)}</Badge>
  );
  if (item.recommendationLevel) {
    statusBadge = <QualitativeRecommendationBadge level={item.recommendationLevel} />;
  }
  let content: ReactNode = (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
      {JSON.stringify(item.artifact, null, 2)}
    </pre>
  );
  if (qualitative.success) {
    content = <EvaluationDetails evaluation={qualitative.data} />;
  }
  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary aria-label="展开完整历史评价" className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
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
      rpcFetch<{
        failures: ResumeEvaluationFailureRecord[];
        records: ResumeEvaluationHistoryRecord[];
      }>(
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">AI 评价</h2>
            <QualitativeRecommendationBadge level={evaluation.recommendationLevel} />
          </div>
          <p className="max-w-3xl text-muted-foreground text-sm leading-6">
            {evaluation.conciseOverall}
          </p>
        </div>
        {summaryAction}
      </div>
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
      <EvaluationDetails evaluation={evaluation} />
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
