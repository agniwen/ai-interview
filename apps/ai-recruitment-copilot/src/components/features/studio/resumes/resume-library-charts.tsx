"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { areaY, d3Curve, defineChart, text } from "@tanstack/charts";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX } from "d3-shape";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineDonutChart } from "@/lib/client/charts/donut";
import { toBeijingDayKey } from "@arc/shared/beijing-calendar";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";

type PipelineBucket =
  | "screening"
  | "ai_interview"
  | "human_interview"
  | "offer"
  | "closed_hired"
  | "closed_rejected";

const FUNNEL_STAGE_META = [
  { color: "var(--pipeline-screening)", id: "entered", label: "已入库" },
  { color: "var(--pipeline-ai-interview)", id: "ai_interview", label: "进入 AI 面试" },
  { color: "var(--pipeline-human-interview)", id: "human_interview", label: "进入真人复面" },
  { color: "var(--pipeline-offer)", id: "offer", label: "进入 Offer" },
  {
    color: "color-mix(in oklch, var(--pipeline-offer) 84%, var(--foreground))",
    id: "closed",
    label: "已结案",
  },
] as const;

const FUNNEL_TRANSITION_SCALING = [
  { exponent: 0.52, floor: 0.24 },
  { exponent: 0.65, floor: 0.18 },
  { exponent: 0.85, floor: 0.12 },
  { exponent: 1, floor: 0.06 },
] as const;
const FUNNEL_FINAL_BASE_RATIO = 0.72;
const FUNNEL_MAX_THICKNESS = 76;

const pipelineTooltipDatumSchema = z.object({
  label: z.string(),
  value: z.number(),
});
const CONVERSION_PURPLE = "oklch(0.55 0.18 295)";
const CONVERSION_PURPLE_LIGHT = "oklch(0.82 0.07 295)";

const RANKING_PERIODS = [
  { label: "今日", value: "today" },
  { label: "昨日", value: "yesterday" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
] as const;

export type RankingPeriod = (typeof RANKING_PERIODS)[number]["value"];

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
  description?: string;
  metrics: [MetricItem, MetricItem];
  children: ReactNode;
}) {
  return (
    <Card className="h-full gap-0 overflow-hidden rounded-xl py-0">
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(2,5rem)] border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,6rem)] 2xl:h-22">
        <CardHeader className="min-w-0 gap-1 p-3 sm:p-4 2xl:p-5">
          <CardTitle className="truncate text-sm sm:text-base">{title}</CardTitle>
          {description ? (
            <CardDescription className="truncate text-xs sm:text-sm">{description}</CardDescription>
          ) : null}
        </CardHeader>
        {metrics.map((metric) => (
          <div
            className="flex min-w-0 flex-col justify-center border-l px-2 py-3 sm:px-3"
            key={metric.label}
          >
            <div className="truncate text-[10px] text-muted-foreground sm:text-xs">
              {metric.label}
            </div>
            <div
              className={cn(
                "mt-1 truncate font-mono font-semibold leading-none tabular-nums",
                metric.value.length >= 5
                  ? "text-base tracking-tight sm:text-xl"
                  : "text-lg sm:text-2xl",
              )}
            >
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
      <CardContent className="p-0">
        <ScrollArea className="h-[260px]" scrollFade scrollbars="scroll">
          <div className="p-4">{children}</div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function formatUtcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function offsetDay(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDay(date);
}

function rankingRange(period: RankingPeriod, today: string) {
  if (period === "today") {
    return { end: today, start: today };
  }
  if (period === "yesterday") {
    const yesterday = offsetDay(today, -1);
    return { end: yesterday, start: yesterday };
  }
  if (period === "month") {
    return { end: today, start: `${today.slice(0, 7)}-01` };
  }
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return { end: today, start: offsetDay(today, -((weekday + 6) % 7)) };
}

export function buildUploaderRanking(
  rows: ResumeLibraryMetrics["dailyAdded"],
  period: RankingPeriod,
  today = toBeijingDayKey(),
) {
  const range = rankingRange(period, today);
  const totals = new Map<
    string,
    { count: number; userId: string; userImage: string | null; userName: string }
  >();

  for (const day of rows) {
    if (day.day < range.start || day.day > range.end) {
      continue;
    }
    for (const user of day.byUser) {
      const current = totals.get(user.userId);
      totals.set(user.userId, {
        count: (current?.count ?? 0) + user.count,
        userId: user.userId,
        userImage: user.userImage,
        userName: user.userName,
      });
    }
  }

  const rankedRows = [...totals.values()].toSorted(
    (left, right) =>
      right.count - left.count || left.userName.localeCompare(right.userName, "zh-CN"),
  );

  return {
    participantCount: rankedRows.length,
    rows: rankedRows.slice(0, 5),
    total: rankedRows.reduce((sum, row) => sum + row.count, 0),
  };
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

export function buildPipelineFunnel(rows: ResumeLibraryMetrics["byPipeline"]) {
  const counts = {
    ai_interview: 0,
    closed_hired: 0,
    closed_rejected: 0,
    human_interview: 0,
    offer: 0,
    screening: 0,
  } satisfies Record<PipelineBucket, number>;
  let total = 0;

  for (const row of rows) {
    const bucket = bucketForRow(row);
    if (bucket) {
      counts[bucket] += row.count;
      total += row.count;
    }
  }

  const closed = counts.closed_hired + counts.closed_rejected;
  const offer = counts.offer + closed;
  const humanInterview = counts.human_interview + offer;
  const aiInterview = counts.ai_interview + humanInterview;
  const values = [total, aiInterview, humanInterview, offer, closed];
  const widthRatios = [1];

  for (let index = 1; index < values.length; index += 1) {
    const previousValue = values[index - 1] ?? 0;
    const value = values[index] ?? 0;
    const retention = previousValue > 0 ? Math.min(1, value / previousValue) : 0;
    const scaling = FUNNEL_TRANSITION_SCALING[index - 1] ?? { exponent: 1, floor: 0 };
    const adjustedRetention = scaling.floor + (1 - scaling.floor) * retention ** scaling.exponent;

    widthRatios.push((widthRatios[index - 1] ?? 1) * adjustedRetention);
  }

  const stages = FUNNEL_STAGE_META.map((stage, index) => ({
    ...stage,
    value: values[index] ?? 0,
    widthRatio: widthRatios[index] ?? 0,
  }));

  return { closed, stages, total };
}

export function buildFunnelLayout(stages: ReturnType<typeof buildPipelineFunnel>["stages"]) {
  const segmentInset = 0.04;
  const samples = [0, 0.25, 0.5, 0.75, 1] as const;
  const points = stages.flatMap((stage, index) => {
    const nextWidthRatio =
      stages[index + 1]?.widthRatio ?? stage.widthRatio * FUNNEL_FINAL_BASE_RATIO;
    return samples.map((progress) => {
      const easedProgress = progress * progress * (3 - 2 * progress);
      const thickness =
        FUNNEL_MAX_THICKNESS *
        (stage.widthRatio + (nextWidthRatio - stage.widthRatio) * easedProgress);
      return {
        ...stage,
        key: `${stage.id}:${progress}`,
        x: index + segmentInset + progress * (1 - segmentInset * 2),
        y1: -thickness / 2,
        y2: thickness / 2,
      };
    });
  });
  const stageLabels = stages.map((stage, index) => ({
    ...stage,
    text: stage.label,
    x: index + 0.5,
    y: 50,
  }));
  const valueLabels = stages.map((stage, index) => ({
    ...stage,
    text: formatCompact(stage.value),
    x: index + 0.5,
    y: 63,
  }));
  return { points, stageLabels, valueLabels };
}

const funnelChartConfig: ChartConfig = {};
for (const stage of FUNNEL_STAGE_META) {
  funnelChartConfig[stage.id] = {
    color: stage.color,
    label: stage.label,
  };
}

const conversionChartConfig: ChartConfig = {
  withInterview: { color: CONVERSION_PURPLE, label: "已发起 AI 面试" },
  withoutInterview: { color: CONVERSION_PURPLE_LIGHT, label: "仅入库" },
};

function StatusCard({ byPipeline }: { byPipeline: ResumeLibraryMetrics["byPipeline"] }) {
  const { closed, stages, total } = useMemo(() => buildPipelineFunnel(byPipeline), [byPipeline]);
  const hasData = total > 0;

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const layout = buildFunnelLayout(stages);
    return defineChart({
      color: {
        domain: stages.map((stage) => stage.id),
        range: stages.map((stage) => stage.color),
      },
      margin: 8,
      marks: [
        areaY(layout.points, {
          color: "id",
          curve: d3Curve(curveMonotoneX),
          fillOpacity: 1,
          id: "recruiting-funnel",
          key: "key",
          x: "x",
          y1: "y1",
          y2: "y2",
          z: "id",
        }),
        text(layout.stageLabels, {
          anchor: "middle",
          fontSize: 9,
          fontWeight: 600,
          id: "funnel-stage-labels",
          key: "id",
          text: "text",
          x: "x",
          y: "y",
        }),
        text(layout.valueLabels, {
          anchor: "middle",
          fontSize: 10,
          fontWeight: 700,
          id: "funnel-value-labels",
          key: "id",
          text: "text",
          x: "x",
          y: "y",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = pipelineTooltipDatumSchema.safeParse(point.datum);
          return result.success ? `${result.data.label}: ${result.data.value}` : "数据不可用";
        },
      },
      x: { axis: false, scale: scaleLinear().domain([0, stages.length]) },
      y: { axis: false, scale: scaleLinear().domain([82, -58]) },
    });
  }, [hasData, stages]);

  return (
    <ChartCardShell
      description={hasData ? "各招聘阶段累计候选人数" : "暂无候选人"}
      metrics={[
        { label: "已入库", value: formatCompact(total) },
        { label: "已结案", value: formatCompact(closed) },
      ]}
      title="招聘流程漏斗"
    >
      <div className="flex min-h-[228px] items-center">
        {hasData && definition ? (
          <ChartContainer className="aspect-auto h-[228px] w-full" config={funnelChartConfig}>
            <Chart
              ariaLabel="招聘流程漏斗"
              className="h-[228px] w-full"
              definition={definition}
              height={228}
            />
          </ChartContainer>
        ) : (
          <EmptyHint message="还没有任何候选人" />
        )}
      </div>
    </ChartCardShell>
  );
}

function isRankingPeriod(value: string): value is RankingPeriod {
  return RANKING_PERIODS.some((period) => period.value === value);
}

function UploaderRankingCard({
  dailyAdded,
  isRefreshing,
  onRefresh,
}: {
  dailyAdded: ResumeLibraryMetrics["dailyAdded"];
  isRefreshing: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<RankingPeriod>("month");
  const ranking = useMemo(() => buildUploaderRanking(dailyAdded, period), [dailyAdded, period]);
  const [leader] = ranking.rows;
  const maximum = leader?.count ?? 1;

  return (
    <ChartCardShell
      description="按候选人入库成员统计"
      metrics={[
        { label: "周期入库", value: formatCompact(ranking.total) },
        { label: "参与成员", value: formatCompact(ranking.participantCount) },
      ]}
      title="入库排行榜"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            aria-label="排行榜统计周期"
            onValueChange={(value) => {
              const [nextPeriod] = value;
              if (nextPeriod && isRankingPeriod(nextPeriod)) {
                setPeriod(nextPeriod);
              }
            }}
            size="sm"
            value={[period]}
            variant="outline"
          >
            {RANKING_PERIODS.map((item) => (
              <ToggleGroupItem className="h-7 px-2.5 text-xs" key={item.value} value={item.value}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {onRefresh ? (
            <Button
              disabled={isRefreshing}
              onClick={onRefresh}
              size="xs"
              type="button"
              variant="ghost"
            >
              <IconRefresh
                className={isRefreshing ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
              刷新
            </Button>
          ) : null}
        </div>
        {ranking.rows.length > 0 ? (
          <ol className="flex flex-col gap-2.5" data-period={period}>
            {ranking.rows.map((row, index) => (
              <li
                className="grid grid-cols-[1rem_1.5rem_minmax(0,1fr)_3.25rem] items-center gap-2"
                key={row.userId}
              >
                <span className="text-center font-mono text-muted-foreground text-xs tabular-nums">
                  {index + 1}
                </span>
                <Avatar label={row.userName} seed={row.userId} size="sm">
                  {row.userImage ? <AvatarImage alt={row.userName} src={row.userImage} /> : null}
                  <AvatarFallback>{row.userName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium text-xs">{row.userName}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full min-w-1.5 rounded-full bg-primary"
                      style={{ width: `${(row.count / maximum) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-right font-mono font-semibold text-xs tabular-nums">
                  {row.count} 份
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyHint message="这个时间范围内还没有新的候选人入库" />
        )}
      </div>
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
      <div className="flex min-h-[228px] items-center">
        {hasData && definition ? (
          <div className="grid w-full grid-cols-[minmax(7.5rem,9rem)_9rem] items-center justify-center gap-3">
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
      </div>
    </ChartCardShell>
  );
}

export function ResumeLibraryCharts({
  chartKey,
  isRefreshing = false,
  metrics,
  onRefresh,
}: {
  chartKey?: string;
  isRefreshing?: boolean;
  metrics: ResumeLibraryMetrics;
  onRefresh?: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <StatusCard byPipeline={metrics.byPipeline} key={`status:${chartKey ?? "metrics"}`} />
      <UploaderRankingCard
        dailyAdded={metrics.dailyAdded}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
      />
      <ConversionCard conversion={metrics.conversion} key={`conversion:${chartKey ?? "metrics"}`} />
    </div>
  );
}
