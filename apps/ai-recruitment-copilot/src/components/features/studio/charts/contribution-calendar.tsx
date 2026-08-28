"use client";

import { useMemo } from "react";
import type { EventListeners } from "overlayscrollbars";
import { cell, defineChart } from "@tanstack/charts";
import { scaleBand, scaleOrdinal } from "d3-scale";
import { utcDay, utcSunday } from "d3-time";
import { z } from "zod";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { withHorizontalWheelScroll } from "@/lib/client/charts/horizontal-wheel-scroll";
import { toBeijingCalendarDate } from "@arc/shared/beijing-calendar";
import { cn } from "@arc/shared/utils";

export interface ContributionDayCount {
  count: number;
  day: string;
}

/** Full-year window for a GitHub-style contribution calendar (~53 weeks). */
const LOOKBACK_DAYS = 365;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
const LEVEL_COLORS = [
  "color-mix(in oklab, var(--muted-foreground) 14%, var(--background))",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;
const CELL_PX = 12;
const CELL_GAP_PX = 2;
const CELL_PITCH = CELL_PX + CELL_GAP_PX;
const BAND_PADDING_INNER = CELL_GAP_PX / CELL_PITCH;
const BAND_PADDING_OUTER = CELL_GAP_PX / (2 * CELL_PITCH);
const CHART_MARGIN = { bottom: 20, left: 6, right: 6, top: 6 } as const;

const chartConfig: ChartConfig = {
  count: { color: LEVEL_COLORS[3], label: "活动" },
};

interface CalendarDayCell {
  count: number;
  date: Date;
  day: string;
  inRange: boolean;
  level: number;
  week: number;
  weekday: string;
}

const calendarTooltipDatumSchema = z.object({
  count: z.number(),
  day: z.string(),
  inRange: z.boolean(),
});

type CalendarTooltipDatum = z.infer<typeof calendarTooltipDatumSchema>;

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countToLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
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

function buildCalendarDays(dailyAdded: readonly ContributionDayCount[]): CalendarDayCell[] {
  const byDay = new Map(dailyAdded.map((row) => [row.day, row]));
  const end = toBeijingCalendarDate();
  const start = utcDay.offset(end, -(LOOKBACK_DAYS - 1));
  const gridStart = utcSunday.floor(start);
  const gridEnd = utcDay.offset(utcSunday.ceil(utcDay.offset(end, 1)), -1);
  const max = Math.max(0, ...dailyAdded.map((row) => row.count));

  const cells: CalendarDayCell[] = [];
  for (
    let cursor = new Date(gridStart);
    cursor.getTime() <= gridEnd.getTime();
    cursor = utcDay.offset(cursor, 1)
  ) {
    const day = formatUtcDay(cursor);
    const inRange = cursor.getTime() >= start.getTime() && cursor.getTime() <= end.getTime();
    const count = inRange ? (byDay.get(day)?.count ?? 0) : 0;
    cells.push({
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

function scrollViewportToEnd(viewport: HTMLElement) {
  viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
}

function createCalendarScrollEvents(): EventListeners {
  let didScrollToEnd = false;
  return withHorizontalWheelScroll({
    initialized: (instance) => {
      didScrollToEnd = false;
      const { viewport } = instance.elements();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (viewport.scrollWidth <= viewport.clientWidth) {
            return;
          }
          scrollViewportToEnd(viewport);
          didScrollToEnd = true;
        });
      });
    },
    updated: (instance) => {
      if (didScrollToEnd) {
        return;
      }
      const { viewport } = instance.elements();
      if (viewport.scrollWidth <= viewport.clientWidth) {
        return;
      }
      scrollViewportToEnd(viewport);
      didScrollToEnd = true;
    },
  });
}

function formatTooltip(row: CalendarTooltipDatum, unitLabel: string): string {
  if (!row.inRange) {
    return `${row.day}\n不在统计范围内`;
  }
  if (row.count === 0) {
    return `${row.day}\n暂无${unitLabel}`;
  }
  return `${row.day} · ${row.count} ${unitLabel}`;
}

export function ContributionCalendar({
  dailyAdded,
  emptyMessage = "过去一年没有活动记录",
  unitLabel = "次",
}: {
  dailyAdded: readonly ContributionDayCount[];
  emptyMessage?: string;
  unitLabel?: string;
}) {
  "use no memo";

  const cells = useMemo(() => buildCalendarDays(dailyAdded), [dailyAdded]);
  const inRangeCells = useMemo(() => cells.filter((row) => row.inRange), [cells]);
  const total = useMemo(
    () => inRangeCells.reduce((sum, row) => sum + row.count, 0),
    [inRangeCells],
  );
  const hasData = total > 0;
  const weekDomain = useMemo(
    () => [...new Set(cells.map((row) => row.week))].toSorted((a, b) => a - b),
    [cells],
  );
  const monthTicks = useMemo(() => monthLabelTicks(cells), [cells]);
  const chartWidth = CHART_MARGIN.left + weekDomain.length * CELL_PITCH + CHART_MARGIN.right;
  const chartHeight = CHART_MARGIN.top + 7 * CELL_PITCH + CHART_MARGIN.bottom;
  const calendarScrollEvents = useMemo(() => createCalendarScrollEvents(), []);

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
          inset: 0,
          key: "day",
          radius: 2,
          x: "week",
          y: "weekday",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = calendarTooltipDatumSchema.safeParse(point.datum);
          return result.success ? formatTooltip(result.data, unitLabel) : "数据不可用";
        },
      },
      x: {
        axis: {
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
        axis: false,
        scale: () =>
          scaleBand<string>()
            .domain([...WEEKDAY_LABELS])
            .paddingInner(BAND_PADDING_INNER)
            .paddingOuter(BAND_PADDING_OUTER),
      },
    });
  }, [cells, hasData, monthTicks, unitLabel, weekDomain]);

  if (!(hasData && definition)) {
    return (
      <Empty className="h-24 border border-border p-4 md:p-4">
        <EmptyHeader>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
          config={chartConfig}
          style={{ height: chartHeight, width: chartWidth }}
        >
          <Chart
            ariaLabel="近一年活动贡献日历"
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
  );
}
