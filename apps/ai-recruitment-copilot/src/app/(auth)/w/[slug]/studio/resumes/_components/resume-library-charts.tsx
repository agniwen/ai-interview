"use client";

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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumeLibraryMetrics } from "@/lib/shared/studio-resumes";
import { studioInterviewStatusMeta } from "@arc/db-schema/studio-interviews";
import type { StudioInterviewStatus } from "@arc/db-schema/studio-interviews";

// "漏斗序"：从待开始 → 已完成。归档不进图。
// Funnel order from pending → completed; archived stays out of the chart.
const STATUS_ORDER: StudioInterviewStatus[] = ["draft", "ready", "in_progress", "completed"];

// 状态对应的色卡变量（与 shadcn chart 调色板对齐）。
// Map each status to a chart palette CSS variable (shadcn chart tokens).
const STATUS_COLORS: Record<StudioInterviewStatus, string> = {
  archived: "var(--muted-foreground)",
  completed: "var(--chart-4)",
  draft: "var(--chart-1)",
  in_progress: "var(--chart-3)",
  ready: "var(--chart-2)",
};

const DAILY_LOOKBACK_DAYS = 30;

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-16 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
      {message}
    </div>
  );
}

// 仅首尾两根 stack 段保留圆角，中间段方角——避免拼接处出现"凹腰"。
// Round the corners of the first / last stack segments only; middle segments
// stay square so the stacked bar reads as a single rounded pill.
function stackRadius(index: number, total: number): [number, number, number, number] | undefined {
  if (index === 0) {
    return [4, 0, 0, 4];
  }
  if (index === total - 1) {
    return [0, 4, 4, 0];
  }
  return undefined;
}

// 与 DAO 共用的"近 30 天"窗口：以今天为右端、UTC 截断到天，零填充缺失日。
// Mirrors the DAO's 30-day window (UTC midnight, today inclusive); fills the
// gaps that the server's `date_trunc` query naturally omits.
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

// 把 byStatus 投影成单行数据，每个状态一个 dataKey；空状态留作 0 让 Bar 不消失。
// Project byStatus into one row whose keys are the status ids; zero-fill so a
// missing status doesn't make the stacked bar disappear.
function buildStatusRow(rows: ResumeLibraryMetrics["byStatus"]) {
  const lookup = new Map(rows.map((row) => [row.status, row.count]));
  const data: Record<string, number | string> = { label: "总计" };
  let total = 0;
  for (const status of STATUS_ORDER) {
    const value = lookup.get(status) ?? 0;
    data[status] = value;
    total += value;
  }
  return { data: [data], total };
}

const statusChartConfig: ChartConfig = {};
for (const status of STATUS_ORDER) {
  statusChartConfig[status] = {
    color: STATUS_COLORS[status],
    label: studioInterviewStatusMeta[status].label,
  };
}

// 第二张：每日新增 — 绿色调；第三张：AI 面试转化 — 紫色调。
// 项目的 --chart-* 都落在蓝色色相上，所以这里直接用 OKLCH 字面量。
// Daily card uses green tones, conversion pie uses purple tones. Project's
// --chart-* tokens are all on a blue hue, so we use OKLCH literals here.
const DAILY_GREEN = "oklch(0.65 0.16 150)";
const CONVERSION_PURPLE = "oklch(0.55 0.18 295)";
const CONVERSION_PURPLE_LIGHT = "oklch(0.82 0.07 295)";

const dailyChartConfig: ChartConfig = {
  count: { color: DAILY_GREEN, label: "新增简历" },
};

const conversionChartConfig: ChartConfig = {
  withInterview: { color: CONVERSION_PURPLE, label: "已发起 AI 面试" },
  withoutInterview: { color: CONVERSION_PURPLE_LIGHT, label: "仅入库" },
};

function StatusCard({ byStatus }: { byStatus: ResumeLibraryMetrics["byStatus"] }) {
  const { data, total } = useMemo(() => buildStatusRow(byStatus), [byStatus]);
  const hasData = total > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>简历状态分布</CardTitle>
        <CardDescription>{hasData ? `共 ${total} 份（不含归档）` : "暂无简历"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasData ? (
          <>
            <ChartContainer className="aspect-auto h-16 w-full" config={statusChartConfig}>
              <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0 }}>
                <XAxis hide type="number" />
                <YAxis dataKey="label" hide type="category" />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                {STATUS_ORDER.map((status, index) => (
                  <Bar
                    dataKey={status}
                    fill={STATUS_COLORS[status]}
                    key={status}
                    radius={stackRadius(index, STATUS_ORDER.length)}
                    stackId="status"
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {STATUS_ORDER.map((status) => (
                <li className="flex items-center gap-2" key={status}>
                  <span
                    aria-hidden
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span className="flex-1 truncate">{studioInterviewStatusMeta[status].label}</span>
                  <span className="tabular-nums">{data[0]?.[status] ?? 0}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyHint message="还没有任何候选人" />
        )}
      </CardContent>
    </Card>
  );
}

function sumCount(rows: { count: number }[]) {
  let acc = 0;
  for (const row of rows) {
    acc += row.count;
  }
  return acc;
}

function DailyAddedCard({ dailyAdded }: { dailyAdded: ResumeLibraryMetrics["dailyAdded"] }) {
  const series = useMemo(() => buildDailySeries(dailyAdded), [dailyAdded]);
  const total = useMemo(() => sumCount(series), [series]);
  const hasData = total > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>近 30 天每日新增</CardTitle>
        <CardDescription>{hasData ? `合计 ${total} 份` : "近 30 天暂无新增"}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

function ConversionCard({ conversion }: { conversion: ResumeLibraryMetrics["conversion"] }) {
  const total = conversion.withInterview + conversion.withoutInterview;
  const percent = total > 0 ? Math.round((conversion.withInterview / total) * 100) : 0;
  const hasData = total > 0;

  // Pie 需要 [{name, value}] 形态；用 key 命名以便 tooltip 和 config 对齐。
  // Pie wants [{name, value}] rows; keys mirror conversionChartConfig keys
  // so ChartTooltipContent can resolve labels/colors.
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
    <Card>
      <CardHeader>
        <CardTitle>AI 面试转化</CardTitle>
        <CardDescription>
          {hasData
            ? `${conversion.withInterview} / ${total} 已发起（${percent}%）`
            : "暂无可统计的简历"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasData ? (
          <>
            <ChartContainer className="mx-auto aspect-square h-32" config={conversionChartConfig}>
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="key" />} />
                <Pie data={data} dataKey="value" innerRadius={32} nameKey="key" outerRadius={56}>
                  {data.map((entry) => (
                    <Cell fill={entry.fill} key={entry.key} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: CONVERSION_PURPLE }}
                />
                <span className="flex-1 truncate">已发起 AI 面试</span>
                <span className="tabular-nums">{conversion.withInterview}</span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: CONVERSION_PURPLE_LIGHT }}
                />
                <span className="flex-1 truncate">仅入库</span>
                <span className="tabular-nums">{conversion.withoutInterview}</span>
              </li>
            </ul>
          </>
        ) : (
          <EmptyHint message="还没有任何候选人" />
        )}
      </CardContent>
    </Card>
  );
}

export function ResumeLibraryCharts({ metrics }: { metrics: ResumeLibraryMetrics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <StatusCard byStatus={metrics.byStatus} />
      <DailyAddedCard dailyAdded={metrics.dailyAdded} />
      <ConversionCard conversion={metrics.conversion} />
    </div>
  );
}
