"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";

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
  closed_rejected: "已淘汰 / 撤回",
  human_interview: "真人复面",
  offer: "Offer",
  screening: "简历筛选",
};

const BUCKET_COLORS: Record<PipelineBucket, string> = {
  ai_interview: "var(--chart-2)",
  closed_hired: "oklch(0.65 0.16 150)",
  closed_rejected: "oklch(0.64 0.2 345)",
  human_interview: "var(--chart-3)",
  offer: "var(--chart-4)",
  screening: "var(--chart-1)",
};

const DAILY_LOOKBACK_DAYS = 30;
const DAILY_GREEN = "oklch(0.65 0.16 150)";
const CONVERSION_PURPLE = "oklch(0.55 0.18 295)";
const CONVERSION_PURPLE_LIGHT = "oklch(0.82 0.07 295)";

function EmptyHint({ message }: { message: string }) {
  return (
    <Empty className="h-24 border border-border p-4 md:p-4">
      <EmptyHeader>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function formatCompact(value: number): string {
  return value.toLocaleString("zh-CN");
}

interface MetricItem {
  label: string;
  value: string;
  description?: string;
}

function ChartCardShell({
  title,
  description,
  metrics,
  children,
}: {
  title: string;
  description: string;
  metrics: [MetricItem, MetricItem];
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <CardHeader className="min-w-0 gap-1 p-4 sm:p-5">
          <CardTitle className="truncate text-base">{title}</CardTitle>
          <CardDescription className="truncate">{description}</CardDescription>
        </CardHeader>
        {metrics.map((metric) => (
          <div className="border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5" key={metric.label}>
            <div className="truncate text-muted-foreground text-xs">{metric.label}</div>
            <div className="mt-1 font-mono font-semibold text-2xl leading-none tabular-nums">
              {metric.value}
            </div>
            {metric.description ? (
              <div className="mt-1 truncate text-muted-foreground text-[10px]">
                {metric.description}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function stackRadius(index: number, total: number): [number, number, number, number] | undefined {
  if (index === 0) {
    return [4, 0, 0, 4];
  }
  if (index === total - 1) {
    return [0, 4, 4, 0];
  }
  return undefined;
}

function buildDailySeries(rows: ResumeLibraryMetrics["dailyAdded"]) {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const series: { day: string; count: number }[] = [];
  for (let i = DAILY_LOOKBACK_DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    series.push({ count: counts.get(key) ?? 0, day: key });
  }
  return series;
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

function buildPipelineRow(rows: ResumeLibraryMetrics["byPipeline"]) {
  const counts: Record<PipelineBucket, number> = {
    ai_interview: 0,
    closed_hired: 0,
    closed_rejected: 0,
    human_interview: 0,
    offer: 0,
    screening: 0,
  };
  let total = 0;

  for (const row of rows) {
    const bucket = bucketForRow(row);
    if (bucket) {
      counts[bucket] += row.count;
      total += row.count;
    }
  }

  const data: Record<string, number | string> = { label: "总计" };
  for (const bucket of BUCKET_ORDER) {
    data[bucket] = counts[bucket];
  }
  const active = counts.screening + counts.ai_interview + counts.human_interview + counts.offer;
  return { active, counts, data: [data], total };
}

const statusChartConfig: ChartConfig = {};
for (const bucket of BUCKET_ORDER) {
  statusChartConfig[bucket] = {
    color: BUCKET_COLORS[bucket],
    label: BUCKET_LABEL[bucket],
  };
}

const dailyChartConfig: ChartConfig = {
  count: { color: DAILY_GREEN, label: "新增简历" },
};

const conversionChartConfig: ChartConfig = {
  withInterview: { color: CONVERSION_PURPLE, label: "已发起 AI 面试" },
  withoutInterview: { color: CONVERSION_PURPLE_LIGHT, label: "仅入库" },
};

function StatusCard({ byPipeline }: { byPipeline: ResumeLibraryMetrics["byPipeline"] }) {
  const { active, counts, data, total } = useMemo(() => buildPipelineRow(byPipeline), [byPipeline]);
  const hasData = total > 0;

  return (
    <ChartCardShell
      description={hasData ? "不含归档候选人" : "暂无候选人"}
      metrics={[
        { label: "总候选", value: formatCompact(total) },
        { label: "推进中", value: formatCompact(active) },
      ]}
      title="面试流程分布"
    >
      {hasData ? (
        <div className="flex flex-col gap-3">
          <ChartContainer className="aspect-auto h-16 w-full" config={statusChartConfig}>
            <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0 }}>
              <XAxis hide type="number" />
              <YAxis dataKey="label" hide type="category" />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {BUCKET_ORDER.map((bucket, index) => (
                <Bar
                  dataKey={bucket}
                  fill={BUCKET_COLORS[bucket]}
                  key={bucket}
                  radius={stackRadius(index, BUCKET_ORDER.length)}
                  stackId="pipeline"
                />
              ))}
            </BarChart>
          </ChartContainer>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {BUCKET_ORDER.map((bucket) => (
              <li className="flex items-center gap-2" key={bucket}>
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: BUCKET_COLORS[bucket] }}
                />
                <span className="flex-1 truncate">{BUCKET_LABEL[bucket]}</span>
                <span className="tabular-nums">{counts[bucket]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyHint message="还没有任何候选人" />
      )}
    </ChartCardShell>
  );
}

function sumCount(rows: { count: number }[]) {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function DailyAddedCard({ dailyAdded }: { dailyAdded: ResumeLibraryMetrics["dailyAdded"] }) {
  const series = useMemo(() => buildDailySeries(dailyAdded), [dailyAdded]);
  const total = useMemo(() => sumCount(series), [series]);
  const peak = useMemo(() => Math.max(0, ...series.map((row) => row.count)), [series]);
  const hasData = total > 0;

  return (
    <ChartCardShell
      description={hasData ? "展示近 30 天新增趋势" : "近 30 天暂无新增"}
      metrics={[
        { label: "30 天新增", value: formatCompact(total) },
        { label: "单日峰值", value: formatCompact(peak) },
      ]}
      title="近 30 天每日新增"
    >
      {hasData ? (
        <ChartContainer className="aspect-auto h-32 w-full" config={dailyChartConfig}>
          <AreaChart accessibilityLayer data={series} margin={{ left: 0, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="fill-resume-daily" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="day"
              interval={6}
              tickFormatter={(value: string) => value.slice(5)}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis allowDecimals={false} axisLine={false} hide tickLine={false} width={24} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value: unknown) => (typeof value === "string" ? value : "")}
                />
              }
            />
            <Area
              dataKey="count"
              fill="url(#fill-resume-daily)"
              stroke="var(--color-count)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <EmptyHint message="过去 30 天没有新简历入库" />
      )}
    </ChartCardShell>
  );
}

function ConversionCard({ conversion }: { conversion: ResumeLibraryMetrics["conversion"] }) {
  const total = conversion.withInterview + conversion.withoutInterview;
  const percent = total > 0 ? Math.round((conversion.withInterview / total) * 100) : 0;
  const hasData = total > 0;

  const data = useMemo(
    () => [
      { fill: CONVERSION_PURPLE, key: "withInterview", value: conversion.withInterview },
      {
        fill: CONVERSION_PURPLE_LIGHT,
        key: "withoutInterview",
        value: conversion.withoutInterview,
      },
    ],
    [conversion.withInterview, conversion.withoutInterview],
  );

  return (
    <ChartCardShell
      description={hasData ? "已发起 AI 面试 / 入库候选人" : "暂无可统计的简历"}
      metrics={[
        { label: "转化率", value: `${percent}%` },
        { label: "已发起", value: formatCompact(conversion.withInterview) },
      ]}
      title="AI 面试转化"
    >
      {hasData ? (
        <div className="grid min-h-36 grid-cols-[minmax(7.5rem,9rem)_9rem] items-center justify-center gap-3">
          <ul className="flex min-w-0 flex-col gap-2 text-muted-foreground text-xs">
            <li className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: CONVERSION_PURPLE }}
              />
              <span className="flex-1 truncate">已发起 AI 面试</span>
              <span className="tabular-nums">{conversion.withInterview}</span>
            </li>
            <li className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: CONVERSION_PURPLE_LIGHT }}
              />
              <span className="flex-1 truncate">仅入库</span>
              <span className="tabular-nums">{conversion.withoutInterview}</span>
            </li>
          </ul>
          <div className="relative size-36">
            <ChartContainer
              className="absolute inset-0 aspect-square size-full"
              config={conversionChartConfig}
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="key" />} />
                <Pie
                  cornerRadius={8}
                  data={data}
                  dataKey="value"
                  innerRadius={42}
                  nameKey="key"
                  outerRadius={64}
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={3}
                >
                  {data.map((entry) => (
                    <Cell fill={entry.fill} fillOpacity={0.78} key={entry.key} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono font-semibold text-2xl tabular-nums">{percent}%</span>
              <span className="text-muted-foreground text-[10px]">转化率</span>
            </div>
          </div>
        </div>
      ) : (
        <EmptyHint message="还没有任何候选人" />
      )}
    </ChartCardShell>
  );
}

export function ResumeLibraryCharts({ metrics }: { metrics: ResumeLibraryMetrics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <StatusCard byPipeline={metrics.byPipeline} />
      <DailyAddedCard dailyAdded={metrics.dailyAdded} />
      <ConversionCard conversion={metrics.conversion} />
    </div>
  );
}
