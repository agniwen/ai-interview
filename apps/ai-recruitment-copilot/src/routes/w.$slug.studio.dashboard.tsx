import {
  ClientOnly,
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
} from "@tanstack/react-router";
import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { loadStudioDashboardState } from "@/lib/start/studio/dashboard.functions";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";
import { PageHeader } from "@/components/features/studio/page-header";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { StudioSummaryCards } from "@/components/features/studio/studio-summary-cards";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { offerDraftStatusMeta } from "@arc/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

type PipelineBucket =
  | "screening"
  | "ai_interview"
  | "human_interview"
  | "offer"
  | "closed_hired"
  | "closed_rejected";

const BUCKET_ORDER: PipelineBucket[] = [
  "screening",
  "ai_interview",
  "human_interview",
  "offer",
  "closed_hired",
  "closed_rejected",
];

const BUCKET_LABEL: Record<PipelineBucket, string> = {
  ai_interview: "AI 面试",
  closed_hired: "已录用",
  closed_rejected: "淘汰 / 撤回",
  human_interview: "真人复面",
  offer: "Offer",
  screening: "简历筛选",
};

const BUCKET_COLORS: Record<PipelineBucket, string> = {
  ai_interview: "var(--chart-2)",
  closed_hired: "var(--chart-5)",
  closed_rejected: "var(--destructive)",
  human_interview: "var(--chart-3)",
  offer: "var(--chart-4)",
  screening: "var(--chart-1)",
};

const activityChartConfig: ChartConfig = {
  aiCompleted: { color: "var(--chart-2)", label: "AI 完成" },
  humanCompleted: { color: "var(--chart-3)", label: "复面完成" },
  offersSent: { color: "var(--chart-4)", label: "Offer 发出" },
  resumesAdded: { color: "var(--chart-1)", label: "新增简历" },
};

const offerChartConfig: ChartConfig = {
  count: { color: "var(--chart-4)", label: "Offer" },
};

function formatCompact(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function percentOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function bucketForRow(row: ResumeLibraryMetrics["byPipeline"][number]): PipelineBucket | null {
  if (row.stage === "closed") {
    if (row.outcome === "hired") {
      return "closed_hired";
    }
    if (row.outcome === "rejected" || row.outcome === "withdrawn") {
      return "closed_rejected";
    }
    return null;
  }
  if (row.stage === "written_test") {
    return "ai_interview";
  }
  if (
    row.stage === "screening" ||
    row.stage === "ai_interview" ||
    row.stage === "human_interview" ||
    row.stage === "offer"
  ) {
    return row.stage;
  }
  return null;
}

function buildFunnelSnapshot(metrics: ResumeLibraryMetrics) {
  const counts: Record<PipelineBucket, number> = {
    ai_interview: 0,
    closed_hired: 0,
    closed_rejected: 0,
    human_interview: 0,
    offer: 0,
    screening: 0,
  };
  let total = 0;

  for (const row of metrics.byPipeline) {
    const bucket = bucketForRow(row);
    if (bucket) {
      counts[bucket] += row.count;
      total += row.count;
    }
  }

  const conversionTotal = metrics.conversion.withInterview + metrics.conversion.withoutInterview;
  const denominator = Math.max(total, conversionTotal);
  const active = counts.screening + counts.ai_interview + counts.human_interview + counts.offer;
  const closed = counts.closed_hired + counts.closed_rejected;

  return {
    active,
    aiLaunchRate: percentOf(metrics.conversion.withInterview, denominator),
    closed,
    counts,
    denominator,
    dropOff: counts.closed_rejected,
    hireRate: percentOf(counts.closed_hired, denominator),
  };
}

function EmptyHint({ message, title }: { message: string; title: string }) {
  return (
    <Empty className="min-h-44 border border-border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function MetricTile({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="min-w-0">
        <div className="truncate text-muted-foreground text-xs">{label}</div>
        <div className="mt-1 font-mono font-semibold text-xl leading-none tabular-nums">
          {value}
        </div>
        <div className="mt-1 truncate text-muted-foreground text-[11px]">{description}</div>
      </div>
    </div>
  );
}

function ChartSkeleton({ className }: { className: string }) {
  return <Skeleton aria-label="图表加载中" className={className} />;
}

function actionBadgeVariant(severity: RecruitingDashboardMetrics["actions"][number]["severity"]) {
  if (severity === "danger") {
    return "destructive";
  }
  if (severity === "warning") {
    return "warning";
  }
  return "info";
}

function FunnelCard({ metrics }: { metrics: ResumeLibraryMetrics }) {
  const snapshot = useMemo(() => buildFunnelSnapshot(metrics), [metrics]);
  const hasData = snapshot.denominator > 0;
  const stages = BUCKET_ORDER.map((bucket) => ({
    bucket,
    color: BUCKET_COLORS[bucket],
    count: snapshot.counts[bucket],
    label: BUCKET_LABEL[bucket],
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">招聘漏斗</CardTitle>
            <CardDescription>按候选人当前所处阶段展示主流程存量和流失结果。</CardDescription>
          </div>
          <Badge variant="outline">不含已归档</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {hasData ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex flex-col gap-3">
              {stages.map((stage) => {
                const share = percentOf(stage.count, snapshot.denominator);
                return (
                  <div
                    className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[7rem_minmax(0,1fr)_5rem] sm:items-center"
                    key={stage.bucket}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{stage.label}</div>
                      <div className="truncate text-muted-foreground text-xs">
                        占漏斗 {formatPercent(share)}
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ backgroundColor: stage.color, width: `${share}%` }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                      <span className="font-mono font-semibold text-lg tabular-nums">
                        {stage.count}
                      </span>
                      <span className="text-muted-foreground text-xs sm:ml-2">
                        {formatPercent(share)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="font-medium text-sm">核心转化</h3>
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">AI 发起率</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatPercent(snapshot.aiLaunchRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">录用率</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatPercent(snapshot.hireRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">推进中</span>
                  <span className="font-mono font-semibold tabular-nums">{snapshot.active}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">已结案</span>
                  <span className="font-mono font-semibold tabular-nums">{snapshot.closed}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyHint message="简历入库后会开始形成漏斗。" title="暂无漏斗数据" />
        )}
      </CardContent>
    </Card>
  );
}

function ActionQueueCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const visibleActions = metrics.actions.filter((item) => item.count > 0);
  const items = visibleActions.length > 0 ? visibleActions : metrics.actions.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">运营待办</CardTitle>
        <CardDescription>从阶段、轮次和通知状态中抽出的需要 HR 关注的队列。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
            key={item.key}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{item.label}</span>
                <Badge variant={actionBadgeVariant(item.severity)}>{item.count}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs leading-normal">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const totalActivity = metrics.activity.reduce(
    (sum, row) => sum + row.resumesAdded + row.aiCompleted + row.humanCompleted + row.offersSent,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">近 30 天招聘活动</CardTitle>
        <CardDescription>新增简历、AI 面试完成、真人复面完成和 Offer 发出趋势。</CardDescription>
      </CardHeader>
      <CardContent>
        {totalActivity > 0 ? (
          <ClientOnly fallback={<ChartSkeleton className="h-72 w-full" />}>
            <ChartContainer className="aspect-auto h-72 w-full" config={activityChartConfig}>
              <BarChart accessibilityLayer data={metrics.activity} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="day"
                  interval={6}
                  tickFormatter={(value: string) => value.slice(5)}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(value: unknown) => (typeof value === "string" ? value : "")}
                    />
                  }
                />
                <Bar
                  dataKey="resumesAdded"
                  fill="var(--color-resumesAdded)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="aiCompleted" fill="var(--color-aiCompleted)" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="humanCompleted"
                  fill="var(--color-humanCompleted)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="offersSent" fill="var(--color-offersSent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </ClientOnly>
        ) : (
          <EmptyHint message="最近 30 天没有可展示的招聘活动。" title="暂无活动趋势" />
        )}
      </CardContent>
    </Card>
  );
}

function JobPipelineCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const total = metrics.jobPipeline.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">岗位候选人分布</CardTitle>
        <CardDescription>按在招岗位展示当前候选人量和关键阶段堆积。</CardDescription>
      </CardHeader>
      <CardContent>
        {metrics.jobPipeline.length > 0 ? (
          <div className="flex flex-col gap-3">
            {metrics.jobPipeline.map((row) => {
              const share = percentOf(row.total, total);
              return (
                <div className="rounded-lg border border-border bg-background p-3" key={row.id}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{row.name}</div>
                      <div className="truncate text-muted-foreground text-xs">
                        {row.departmentName ?? "未归属部门"}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-sm tabular-nums">
                      {row.total} 人
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground text-xs">
                    <span>筛选 {row.screening}</span>
                    <span>AI {row.aiInterview}</span>
                    <span>复面 {row.humanInterview}</span>
                    <span>Offer {row.offer}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyHint message="绑定岗位后会展示各岗位候选人分布。" title="暂无岗位数据" />
        )}
      </CardContent>
    </Card>
  );
}

function OfferStatusCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const data = metrics.offerStatuses.map((row) => ({
    ...row,
    fill: offerDraftStatusMeta[row.status].tone === "success" ? "var(--chart-5)" : "var(--chart-4)",
    label: offerDraftStatusMeta[row.status].label,
  }));
  const total = data.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Offer 状态</CardTitle>
        <CardDescription>展示 Offer 草稿、发送、接受、拒绝和过期状态。</CardDescription>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
            <ClientOnly fallback={<ChartSkeleton className="size-48" />}>
              <ChartContainer className="aspect-square size-48" config={offerChartConfig}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="label" />} />
                  <Pie
                    cornerRadius={8}
                    data={data}
                    dataKey="count"
                    innerRadius={48}
                    nameKey="label"
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={3}
                  >
                    {data.map((entry, index) => (
                      <Cell
                        fill={index % 2 === 0 ? entry.fill : "var(--chart-2)"}
                        key={entry.status}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </ClientOnly>
            <div className="flex flex-col gap-2">
              {data.map((row) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={row.status}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-mono font-semibold tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyHint message="进入 Offer 阶段后会展示状态构成。" title="暂无 Offer 数据" />
        )}
      </CardContent>
    </Card>
  );
}

function RecruitingDashboardPage({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const funnel = buildFunnelSnapshot(metrics.resume);
  const aiStarted = metrics.resume.conversion.withInterview;

  return (
    <div className="container mx-auto max-w-7xl flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="数据看板"
        description="从候选人漏斗、待办队列、招聘活动、岗位分布和 Offer 状态观察当前招聘运营。"
      />
      <StudioSummaryCards
        items={[
          {
            description: "不含已归档候选人",
            id: "funnel-total",
            label: "漏斗总数",
            value: formatCompact(funnel.denominator),
          },
          {
            description: `${aiStarted} 人已发起 AI 面试`,
            id: "ai-launch-rate",
            label: "AI 发起率",
            value: formatPercent(funnel.aiLaunchRate),
          },
          {
            description: `近 30 天完成 ${metrics.summary.aiCompleted30d} 场`,
            id: "ai-completed",
            label: "AI 完成",
            value: formatCompact(metrics.summary.aiCompleted30d),
          },
          {
            description: `近 30 天发出 ${metrics.summary.offersSent30d} 个`,
            id: "offers-sent",
            label: "Offer 发出",
            value: formatCompact(metrics.summary.offersSent30d),
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <FunnelCard metrics={metrics.resume} />
        <ActionQueueCard metrics={metrics} />
      </div>

      <ActivityCard metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <JobPipelineCard metrics={metrics} />
        <div className="flex flex-col gap-4">
          <OfferStatusCard metrics={metrics} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">近 30 天补充指标</CardTitle>
              <CardDescription>表单、复面和漏斗结果的快速读数。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <MetricTile
                description="候选人侧已提交的面试前表单"
                label="表单提交"
                value={formatCompact(metrics.summary.formsSubmitted30d)}
              />
              <MetricTile
                description="人工复面完成量"
                label="复面完成"
                value={formatCompact(metrics.summary.humanCompleted30d)}
              />
              <MetricTile
                description={`${funnel.dropOff} 人淘汰或撤回`}
                label="录用率"
                value={formatPercent(funnel.hireRate)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StudioDashboardRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/dashboard" });

  if (state.status !== "ready") {
    return null;
  }

  return <RecruitingDashboardPage metrics={state.metrics} />;
}

export const Route = createFileRoute("/w/$slug/studio/dashboard")({
  component: StudioDashboardRoute,
  head: () => ({
    meta: [{ title: "数据看板" }],
  }),
  loader: async ({ params }) => {
    await requireStudioPageAccess({
      action: "dashboard",
      pathname: `/w/${params.slug}/studio/dashboard`,
      slug: params.slug,
    });
    const state = await loadStudioDashboardState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/dashboard`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
});
