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

// 漏斗桶：把 (pipelineStage, outcome) 二维分组压成一维展示桶。
// closed 阶段按 outcome 拆成「已录用」「已淘汰/撤回」两段；archived outcome 不进图（DAO 已排除）。
// written_test 当前 UI 隐藏，进 ai_interview 桶。
// Funnel buckets: collapse (pipelineStage, outcome) into a single display
// axis. Closed splits into hired vs rejected/withdrawn; archived is excluded
// upstream. written_test merges into ai_interview (hidden tab).
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

// 颜色：前 4 个用项目的 chart palette（一致性），后两个用 success / muted。
// First four use the project chart palette; the closed pair uses success / muted.
const BUCKET_COLORS: Record<PipelineBucket, string> = {
  ai_interview: "var(--chart-2)",
  closed_hired: "oklch(0.65 0.16 150)",
  closed_rejected: "var(--muted-foreground)",
  human_interview: "var(--chart-3)",
  offer: "var(--chart-4)",
  screening: "var(--chart-1)",
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

// 把 (pipelineStage, outcome) 行折叠到 6 个桶，再投影成单行数据。
// Fold (pipelineStage, outcome) rows into the 6 display buckets and project
// them into a single row keyed by bucket id; zero-fill keeps the stacked bar
// from collapsing when a bucket is empty.
function bucketForRow(row: ResumeLibraryMetrics["byPipeline"][number]): PipelineBucket | null {
  if (row.stage === "closed") {
    if (row.outcome === "hired") {
      return "closed_hired";
    }
    // archived 在 DAO 已排除；rejected / withdrawn 统一进「淘汰/撤回」桶。
    // archived already filtered by the DAO; rejected & withdrawn share a bucket.
    if (row.outcome === "rejected" || row.outcome === "withdrawn") {
      return "closed_rejected";
    }
    return null;
  }
  // written_test 隐藏，并入 AI 面试；其余非 closed 阶段直接对应同名桶。
  // written_test merges into ai_interview; other non-closed stages map 1:1.
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
  return { counts, data: [data], total };
}

const statusChartConfig: ChartConfig = {};
for (const bucket of BUCKET_ORDER) {
  statusChartConfig[bucket] = {
    color: BUCKET_COLORS[bucket],
    label: BUCKET_LABEL[bucket],
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

function StatusCard({ byPipeline }: { byPipeline: ResumeLibraryMetrics["byPipeline"] }) {
  const { counts, data, total } = useMemo(() => buildPipelineRow(byPipeline), [byPipeline]);
  const hasData = total > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>面试流程分布</CardTitle>
        <CardDescription>
          {hasData ? `共 ${total} 位候选人（不含归档）` : "暂无候选人"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasData ? (
          <>
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
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
      <StatusCard byPipeline={metrics.byPipeline} />
      <DailyAddedCard dailyAdded={metrics.dailyAdded} />
      <ConversionCard conversion={metrics.conversion} />
    </div>
  );
}
