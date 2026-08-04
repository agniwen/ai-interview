"use client";

import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import type { EventListeners } from "overlayscrollbars";
import { barX, cell, defineChart, stack } from "@tanstack/charts";
import { scaleBand, scaleLinear, scaleOrdinal } from "d3-scale";
import { utcDay, utcSunday } from "d3-time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { defineDonutChart } from "@/lib/client/charts/donut";
import { withHorizontalWheelScroll } from "@/lib/client/charts/horizontal-wheel-scroll";
import { toBeijingCalendarDate } from "@arc/shared/beijing-calendar";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";

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

/** Full-year window for the GitHub-style contribution calendar (~53 weeks). */
const DAILY_LOOKBACK_DAYS = 365;
/** Sunday-first rows; all seven labels are shown on the axis. */
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
/** Discrete contribution levels 0–4 (empty → high). */
const LEVEL_COLORS = [
  "color-mix(in oklab, var(--muted-foreground) 14%, var(--background))",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;
/** Square cell size (GitHub-like). */
const CELL_PX = 12;
/** Visual gap between cells — applied only via band padding (not cell inset). */
const CELL_GAP_PX = 2;
const CELL_PITCH = CELL_PX + CELL_GAP_PX;
/** Band padding ratios so cell gaps stay even on both axes. */
const BAND_PADDING_INNER = CELL_GAP_PX / CELL_PITCH;
/** Small outer pad so the grid sits slightly off the axis labels. */
const BAND_PADDING_OUTER = CELL_GAP_PX / (2 * CELL_PITCH);
/** Plot margins: bottom keeps month labels; left stays tight without weekday labels. */
const CHART_MARGIN = { bottom: 20, left: 6, right: 6, top: 6 } as const;
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

interface CalendarDayCell {
  byUser: ResumeLibraryMetrics["dailyAdded"][number]["byUser"];
  count: number;
  date: Date;
  day: string;
  /** Whether the day falls inside the lookback window (week-edge padding). */
  inRange: boolean;
  level: 0 | 1 | 2 | 3 | 4;
  week: number;
  weekday: (typeof WEEKDAY_LABELS)[number];
}

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Map raw counts onto GitHub-like 0–4 intensity levels. */
function countToLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  if (max <= 4) {
    return Math.min(count, 4) as 0 | 1 | 2 | 3 | 4;
  }
  const ratio = count / max;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
}

/**
 * Build a full Sunday-aligned week grid covering the last year (GitHub style).
 * Leading/trailing days outside the lookback window still fill each week column
 * but are marked `inRange: false`.
 */
function buildCalendarDays(rows: ResumeLibraryMetrics["dailyAdded"]): CalendarDayCell[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const end = toBeijingCalendarDate();
  const start = utcDay.offset(end, -(DAILY_LOOKBACK_DAYS - 1));
  const gridStart = utcSunday.floor(start);
  const gridEnd = utcDay.offset(utcSunday.ceil(utcDay.offset(end, 1)), -1);

  let max = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = utcDay.offset(cursor, 1)) {
    max = Math.max(max, byDay.get(formatUtcDay(cursor))?.count ?? 0);
  }

  const cells: CalendarDayCell[] = [];
  for (
    let cursor = gridStart;
    cursor.getTime() <= gridEnd.getTime();
    cursor = utcDay.offset(cursor, 1)
  ) {
    const day = formatUtcDay(cursor);
    const inRange = cursor.getTime() >= start.getTime() && cursor.getTime() <= end.getTime();
    const row = byDay.get(day);
    const count = inRange ? (row?.count ?? 0) : 0;
    cells.push({
      byUser: inRange ? (row?.byUser ?? []) : [],
      count,
      date: cursor,
      day,
      inRange,
      level: inRange ? countToLevel(count, max) : 0,
      week: utcSunday.count(gridStart, cursor),
      weekday: WEEKDAY_LABELS[cursor.getUTCDay()] ?? "日",
    });
  }
  return cells;
}

function formatDailyTooltip(row: CalendarDayCell): string {
  if (!row.inRange) {
    return `${row.day}\n不在统计范围内`;
  }
  const header = `${row.day} · 共 ${row.count} 份`;
  if (row.count === 0 || row.byUser.length === 0) {
    return `${header}\n暂无上传`;
  }
  const lines = row.byUser.map((user) => `${user.userName}：${user.count} 份`);
  return [header, ...lines].join("\n");
}

/** One tick per calendar month that appears in-range (first day of that month). */
function monthLabelTicks(cells: CalendarDayCell[]): { label: string; week: number }[] {
  const ticks: { label: string; week: number }[] = [];
  let previousMonth = -1;
  for (const item of cells) {
    if (!item.inRange) {
      continue;
    }
    const month = item.date.getUTCMonth();
    if (month === previousMonth) {
      continue;
    }
    previousMonth = month;
    ticks.push({
      label: `${month + 1}月`,
      week: item.week,
    });
  }
  return ticks;
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

  const stackRows = BUCKET_ORDER.map((bucket) => ({
    bucket,
    category: "总计",
    color: BUCKET_COLORS[bucket],
    label: BUCKET_LABEL[bucket],
    value: counts[bucket],
  }));
  const active = counts.screening + counts.ai_interview + counts.human_interview + counts.offer;
  return { active, counts, stackRows, total };
}

const statusChartConfig: ChartConfig = {};
for (const bucket of BUCKET_ORDER) {
  statusChartConfig[bucket] = {
    color: BUCKET_COLORS[bucket],
    label: BUCKET_LABEL[bucket],
  };
}

const dailyChartConfig: ChartConfig = {
  count: { color: LEVEL_COLORS[3], label: "新增简历" },
};

const conversionChartConfig: ChartConfig = {
  withInterview: { color: CONVERSION_PURPLE, label: "已发起 AI 面试" },
  withoutInterview: { color: CONVERSION_PURPLE_LIGHT, label: "仅入库" },
};

function StatusCard({ byPipeline }: { byPipeline: ResumeLibraryMetrics["byPipeline"] }) {
  const { active, counts, stackRows, total } = useMemo(
    () => buildPipelineRow(byPipeline),
    [byPipeline],
  );
  const hasData = total > 0;

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    return defineChart({
      margin: { bottom: 4, left: 0, right: 0, top: 4 },
      marks: [
        barX(stackRows, {
          fill: (row) => row.color,
          layout: stack({ order: BUCKET_ORDER }),
          radius: 4,
          x: "value",
          y: "category",
          z: "bucket",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const row = point.datum as (typeof stackRows)[number];
          return `${row.label}: ${row.value}`;
        },
      },
      x: {
        axis: false,
        scale: scaleLinear,
      },
      y: {
        axis: false,
        scale: () => scaleBand().padding(0.2),
      },
    });
  }, [hasData, stackRows]);

  return (
    <ChartCardShell
      description={hasData ? "不含归档候选人" : "暂无候选人"}
      metrics={[
        { label: "总候选", value: formatCompact(total) },
        { label: "推进中", value: formatCompact(active) },
      ]}
      title="面试流程分布"
    >
      {hasData && definition ? (
        <div className="flex flex-col gap-3">
          <ChartContainer className="aspect-auto h-16 w-full" config={statusChartConfig}>
            <Chart
              ariaLabel="面试流程分布"
              className="h-16 w-full"
              definition={definition}
              height={64}
            />
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

function scrollViewportToEnd(viewport: HTMLElement) {
  viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
}

function DailyAddedCard({ dailyAdded }: { dailyAdded: ResumeLibraryMetrics["dailyAdded"] }) {
  const cells = useMemo(() => buildCalendarDays(dailyAdded), [dailyAdded]);
  const inRangeCells = useMemo(() => cells.filter((row) => row.inRange), [cells]);
  const total = useMemo(() => sumCount(inRangeCells), [inRangeCells]);
  const peak = useMemo(() => Math.max(0, ...inRangeCells.map((row) => row.count)), [inRangeCells]);
  const hasData = total > 0;
  const weekDomain = useMemo(
    () => [...new Set(cells.map((row) => row.week))].toSorted((a, b) => a - b),
    [cells],
  );
  const monthTicks = useMemo(() => monthLabelTicks(cells), [cells]);
  const chartWidth = CHART_MARGIN.left + weekDomain.length * CELL_PITCH + CHART_MARGIN.right;
  const chartHeight = CHART_MARGIN.top + 7 * CELL_PITCH + CHART_MARGIN.bottom;
  // Scroll once to the newest weeks after the first layout that actually overflows.
  const didScrollToEndRef = useRef(false);
  const calendarScrollEvents = useMemo<EventListeners>(
    () =>
      withHorizontalWheelScroll({
        initialized: (instance) => {
          didScrollToEndRef.current = false;
          const { viewport } = instance.elements();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (viewport.scrollWidth <= viewport.clientWidth) {
                return;
              }
              scrollViewportToEnd(viewport);
              didScrollToEndRef.current = true;
            });
          });
        },
        updated: (instance) => {
          if (didScrollToEndRef.current) {
            return;
          }
          const { viewport } = instance.elements();
          if (viewport.scrollWidth <= viewport.clientWidth) {
            return;
          }
          scrollViewportToEnd(viewport);
          didScrollToEndRef.current = true;
        },
      }),
    [],
  );

  const definition = useMemo(() => {
    if (!hasData || cells.length === 0) {
      return null;
    }
    const monthLabelByWeek = new Map(monthTicks.map((tick) => [tick.week, tick.label]));
    const monthWeekValues = monthTicks.map((tick) => tick.week);

    return defineChart({
      color: {
        domain: [0, 1, 2, 3, 4],
        range: [...LEVEL_COLORS],
        scale: () =>
          scaleOrdinal<number, string>()
            .domain([0, 1, 2, 3, 4])
            .range([...LEVEL_COLORS]),
      },
      margin: { ...CHART_MARGIN },
      marks: [
        cell(cells, {
          color: "level",
          // Gap comes from band padding only — avoid double spacing via inset.
          inset: 0,
          key: "day",
          radius: 2,
          x: "week",
          y: "weekday",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => formatDailyTooltip(point.datum as CalendarDayCell),
      },
      x: {
        axis: {
          // Keep month text only — no axis baseline / tick stubs.
          line: false,
          tickLabels: { thin: false },
          ticks: {
            format: (value: number) => monthLabelByWeek.get(value) ?? "",
            padding: 6,
            size: 0,
            values: monthWeekValues,
          },
        },
        scale: () =>
          scaleBand<number>()
            .domain(weekDomain)
            .paddingInner(BAND_PADDING_INNER)
            .paddingOuter(BAND_PADDING_OUTER),
      },
      y: {
        // Weekday rows stay in the scale for layout; hide the entire y-axis chrome.
        axis: false,
        scale: () =>
          scaleBand<string>()
            .domain([...WEEKDAY_LABELS])
            .paddingInner(BAND_PADDING_INNER)
            .paddingOuter(BAND_PADDING_OUTER),
      },
    });
  }, [cells, hasData, monthTicks, weekDomain]);

  return (
    <ChartCardShell
      description={hasData ? "近一年每日入库热力，悬停可看各成员上传量" : "近一年暂无新增"}
      metrics={[
        { label: "一年新增", value: formatCompact(total) },
        { label: "单日峰值", value: formatCompact(peak) },
      ]}
      title="入库日历"
    >
      {hasData && definition ? (
        <div className="flex flex-col gap-2">
          {/* Project-themed OverlayScrollbars (os-theme-app); start at newest weeks. */}
          <ScrollArea
            className="w-full"
            events={calendarScrollEvents}
            options={{
              overflow: { x: "scroll", y: "hidden" },
              scrollbars: {
                autoHide: "leave",
                autoHideDelay: 600,
                theme: "os-theme-app",
              },
            }}
          >
            <ChartContainer
              className="aspect-auto"
              config={dailyChartConfig}
              style={{ height: chartHeight, width: chartWidth }}
            >
              <Chart
                ariaLabel="近一年简历入库贡献日历"
                className="h-full w-full"
                definition={definition}
                height={chartHeight}
                width={chartWidth}
              />
            </ChartContainer>
          </ScrollArea>
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground text-[10px]">
            <span>少</span>
            {LEVEL_COLORS.map((color) => (
              <span
                aria-hidden
                className={cn("inline-block rounded-[2px]")}
                key={color}
                style={{
                  backgroundColor: color,
                  height: CELL_PX,
                  width: CELL_PX,
                }}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      ) : (
        <EmptyHint message="过去一年没有新简历入库" />
      )}
    </ChartCardShell>
  );
}

function ConversionCard({ conversion }: { conversion: ResumeLibraryMetrics["conversion"] }) {
  const total = conversion.withInterview + conversion.withoutInterview;
  const percent = total > 0 ? Math.round((conversion.withInterview / total) * 100) : 0;
  const hasData = total > 0;

  const slices = useMemo(
    () => [
      {
        fill: CONVERSION_PURPLE,
        key: "withInterview",
        label: "已发起 AI 面试",
        value: conversion.withInterview,
      },
      {
        fill: CONVERSION_PURPLE_LIGHT,
        key: "withoutInterview",
        label: "仅入库",
        value: conversion.withoutInterview,
      },
    ],
    [conversion.withInterview, conversion.withoutInterview],
  );

  const definition = useMemo(
    () => (hasData ? defineDonutChart(slices, { innerRatio: 0.66 }) : null),
    [hasData, slices],
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
      {hasData && definition ? (
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
              <Chart
                ariaLabel="AI 面试转化"
                className="size-full"
                definition={definition}
                height={144}
              />
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
