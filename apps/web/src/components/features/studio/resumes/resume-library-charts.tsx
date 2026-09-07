"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { barX, defineChart, stack } from "@tanstack/charts";
import { scaleBand, scaleLinear } from "d3-scale";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defineDonutChart } from "@/lib/client/charts/donut";
import { toBeijingDayKey } from "@app/shared/beijing-calendar";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";
import { recruitingBoardStagePresets } from "@app/shared/recruiting-board";
import { cn } from "@app/shared/utils";
import { getBoardFlowColor, PIPELINE_COLORS } from "./resume-library-chart-colors";

type PipelineBucket = "screening" | "interview" | "offer" | "onboarding" | "closed";

const BUCKET_ORDER: PipelineBucket[] = ["screening", "interview", "offer", "onboarding", "closed"];

const BUCKET_LABEL = {
  closed: "已结束",
  interview: "面试",
  offer: "Offer协商",
  onboarding: "入职办理",
  screening: "简历筛选",
} as const satisfies Record<PipelineBucket, string>;

const BUCKET_COLORS = {
  closed: PIPELINE_COLORS.failure,
  interview: PIPELINE_COLORS.advanced,
  offer: PIPELINE_COLORS.final,
  onboarding: PIPELINE_COLORS.success,
  screening: PIPELINE_COLORS.early,
} as const satisfies Record<PipelineBucket, string>;

const MIN_PIPELINE_VISUAL_SHARE = 0.035;

interface FlowStackRow {
  bucket: string;
  category: string;
  color: string;
  label: string;
  value: number;
  visualShare: number;
}

const pipelineTooltipDatumSchema = z.object({
  label: z.string(),
  value: z.number(),
});
const CONVERSION_ACCENT = "var(--chart-conversion)";
const CONVERSION_ACCENT_MUTED = "var(--chart-conversion-muted)";
const BOARD_SHARE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
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
  compact = false,
  children,
}: {
  title: string;
  description?: string;
  metrics: [MetricItem, MetricItem];
  compact?: boolean;
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
        <ScrollArea className={compact ? "h-[208px]" : "h-[260px]"} scrollFade scrollbars="scroll">
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
    return "closed";
  }
  if (["ai_interview", "second_interview", "final_interview"].includes(row.stage)) {
    return "interview";
  }
  if (["income_proof", "offer", "background_check"].includes(row.stage)) {
    return "offer";
  }
  if (row.stage === "screening" || row.stage === "onboarding") {
    return row.stage;
  }
  return null;
}

function buildReadablePipelineShares(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return values.map(() => 0);
  }

  const actualShares = values.map((value) => value / total);
  const visibleIndexes = values.flatMap((value, index) => (value > 0 ? [index] : []));
  const fixedIndexes = new Set<number>();

  while (fixedIndexes.size < visibleIndexes.length) {
    const flexibleIndexes = visibleIndexes.filter((index) => !fixedIndexes.has(index));
    const availableShare = 1 - fixedIndexes.size * MIN_PIPELINE_VISUAL_SHARE;
    const flexibleTotal = flexibleIndexes.reduce(
      (sum, index) => sum + (actualShares[index] ?? 0),
      0,
    );
    const newlyFixedIndexes = flexibleIndexes.filter(
      (index) =>
        ((actualShares[index] ?? 0) / flexibleTotal) * availableShare < MIN_PIPELINE_VISUAL_SHARE,
    );
    if (newlyFixedIndexes.length === 0) {
      break;
    }
    for (const index of newlyFixedIndexes) {
      fixedIndexes.add(index);
    }
  }

  const flexibleIndexes = visibleIndexes.filter((index) => !fixedIndexes.has(index));
  const availableShare = 1 - fixedIndexes.size * MIN_PIPELINE_VISUAL_SHARE;
  const flexibleTotal = flexibleIndexes.reduce((sum, index) => sum + (actualShares[index] ?? 0), 0);

  return values.map((value, index) => {
    if (value <= 0) {
      return 0;
    }
    if (fixedIndexes.has(index)) {
      return MIN_PIPELINE_VISUAL_SHARE;
    }
    return ((actualShares[index] ?? 0) / flexibleTotal) * availableShare;
  });
}

export function buildPipelineRow(rows: ResumeLibraryMetrics["byPipeline"]) {
  const counts = {
    closed: 0,
    interview: 0,
    offer: 0,
    onboarding: 0,
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

  const visualShares = buildReadablePipelineShares(BUCKET_ORDER.map((bucket) => counts[bucket]));
  const stackRows: FlowStackRow[] = BUCKET_ORDER.map((bucket, index) => ({
    bucket,
    category: "总计",
    color: BUCKET_COLORS[bucket],
    label: BUCKET_LABEL[bucket],
    value: counts[bucket],
    visualShare: visualShares[index] ?? 0,
  }));
  const active = total - counts.closed;
  return { active, counts, stackRows, total };
}

export function buildBoardFlowRow(counts: NonNullable<ResumeLibraryMetrics["boardStatusCounts"]>) {
  let total = 0;
  for (const item of counts) {
    total += item.count;
  }
  const visualShares = buildReadablePipelineShares(counts.map((item) => item.count));
  const stackRows: FlowStackRow[] = counts.map((item, index) => ({
    bucket: item.view,
    category: "总计",
    color: getBoardFlowColor(item.view, index),
    label: item.label,
    value: item.count,
    visualShare: visualShares[index] ?? 0,
  }));
  return { stackRows, total };
}

const conversionChartConfig: ChartConfig = {
  withInterview: { color: CONVERSION_ACCENT, label: "已发起 AI 面试" },
  withoutInterview: { color: CONVERSION_ACCENT_MUTED, label: "仅入库" },
};

function StatusCard({
  byPipeline,
  compact = false,
  distribution,
  description,
  title = "招聘流程分布",
}: {
  byPipeline: ResumeLibraryMetrics["byPipeline"];
  compact?: boolean;
  distribution?: NonNullable<ResumeLibraryMetrics["boardStatusCounts"]>;
  description?: string;
  title?: string;
}) {
  const pipeline = useMemo(() => buildPipelineRow(byPipeline), [byPipeline]);
  const boardFlow = useMemo(
    () => (distribution ? buildBoardFlowRow(distribution) : null),
    [distribution],
  );
  const stackRows = boardFlow?.stackRows ?? pipeline.stackRows;
  const total = boardFlow?.total ?? pipeline.total;
  const { active } = pipeline;
  const hasData = total > 0;
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        stackRows.map((row) => [row.bucket, { color: row.color, label: row.label }]),
      ),
    [stackRows],
  );

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    return defineChart({
      margin: { bottom: 4, left: 0, right: 0, top: 4 },
      marks: [
        barX(stackRows, {
          fill: (row) => row.color,
          layout: stack({ order: stackRows.map((row) => row.bucket) }),
          radius: 4,
          x: "visualShare",
          y: "category",
          z: "bucket",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = pipelineTooltipDatumSchema.safeParse(point.datum);
          return result.success ? `${result.data.label}: ${result.data.value}` : "数据不可用";
        },
      },
      x: { axis: false, scale: scaleLinear },
      y: { axis: false, scale: () => scaleBand().padding(0.2) },
    });
  }, [hasData, stackRows]);

  return (
    <ChartCardShell
      compact={compact}
      description={hasData ? (description ?? "不含归档候选人") : "暂无候选人"}
      metrics={[
        { label: "总候选", value: formatCompact(total) },
        { label: "推进中", value: formatCompact(active) },
      ]}
      title={title}
    >
      <div className={cn("flex items-center", compact ? "min-h-[176px]" : "min-h-[228px]")}>
        {hasData && definition ? (
          <div className="flex w-full flex-col justify-center gap-3">
            <ChartContainer className="aspect-auto h-[86px] w-full" config={config}>
              <Chart
                ariaLabel="面试流程分布"
                className="h-[86px] w-full"
                definition={definition}
                height={86}
              />
            </ChartContainer>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
              {stackRows.map((row) => (
                <li className="flex items-center gap-2" key={row.bucket}>
                  <span
                    aria-hidden
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="flex-1 truncate">{row.label}</span>
                  <span className="tabular-nums">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyHint message="还没有任何候选人" />
        )}
      </div>
    </ChartCardShell>
  );
}

export function buildBoardStatusSummary(
  counts: NonNullable<ResumeLibraryMetrics["boardStatusCounts"]>,
) {
  let total = 0;
  for (const item of counts) {
    total += item.count;
  }
  const slices = counts.map((item, index) => ({
    fill: BOARD_SHARE_COLORS[index % BOARD_SHARE_COLORS.length],
    key: item.view,
    label: item.label,
    percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
    value: item.count,
  }));
  let largestPercent = 0;
  for (const slice of slices) {
    largestPercent = Math.max(largestPercent, slice.percent);
  }
  return { largestPercent, slices, total };
}

function BoardStatusCard({
  counts,
  stageLabel,
}: {
  counts: NonNullable<ResumeLibraryMetrics["boardStatusCounts"]>;
  stageLabel: string;
}) {
  const { largestPercent, slices, total } = useMemo(
    () => buildBoardStatusSummary(counts),
    [counts],
  );
  const definition = useMemo(
    () => (total > 0 ? defineDonutChart(slices, { innerRatio: 0.66 }) : null),
    [slices, total],
  );
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(slices.map((slice) => [slice.key, slice])),
    [slices],
  );

  return (
    <ChartCardShell
      compact
      description={total > 0 ? "当前阶段各状态占比" : "暂无可统计的候选人"}
      metrics={[
        { label: "阶段候选", value: formatCompact(total) },
        { label: "最大占比", value: `${largestPercent}%` },
      ]}
      title={`${stageLabel}状态占比`}
    >
      <div className="flex min-h-[176px] items-center">
        {definition ? (
          <div className="grid w-full grid-cols-[minmax(7.5rem,10rem)_9rem] items-center justify-center gap-3">
            <ul className="flex min-w-0 flex-col gap-2 text-muted-foreground text-xs">
              {slices.map((slice) => (
                <li className="flex min-w-0 items-center gap-2" key={slice.key}>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: slice.fill }}
                  />
                  <span className="flex-1 truncate">{slice.label}</span>
                  <span className="tabular-nums">
                    {slice.value} · {slice.percent}%
                  </span>
                </li>
              ))}
            </ul>
            <div className="relative size-36">
              <ChartContainer className="absolute inset-0 aspect-square size-full" config={config}>
                <Chart
                  ariaLabel={`${stageLabel}状态占比`}
                  className="size-full"
                  definition={definition}
                  height={144}
                />
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono font-semibold text-2xl tabular-nums">{total}</span>
                <span className="text-muted-foreground text-[10px]">候选人</span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyHint message="当前阶段还没有候选人" />
        )}
      </div>
    </ChartCardShell>
  );
}

function isRankingPeriod(value: string): value is RankingPeriod {
  return RANKING_PERIODS.some((period) => period.value === value);
}

function UploaderRankingPanel({
  period,
  ranking,
}: {
  period: RankingPeriod;
  ranking: ReturnType<typeof buildUploaderRanking>;
}) {
  const maximum = ranking.rows[0]?.count ?? 1;

  return ranking.rows.length > 0 ? (
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
                className="h-full min-w-1.5 rounded-full bg-chart-1"
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
    <div data-period={period}>
      <EmptyHint message="这个时间范围内还没有新的候选人入库" />
    </div>
  );
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
  const rankings = useMemo(
    () => ({
      month: buildUploaderRanking(dailyAdded, "month"),
      today: buildUploaderRanking(dailyAdded, "today"),
      week: buildUploaderRanking(dailyAdded, "week"),
      yesterday: buildUploaderRanking(dailyAdded, "yesterday"),
    }),
    [dailyAdded],
  );
  const ranking = rankings[period];

  return (
    <ChartCardShell
      description="按候选人入库成员统计"
      metrics={[
        { label: "周期入库", value: formatCompact(ranking.total) },
        { label: "参与成员", value: formatCompact(ranking.participantCount) },
      ]}
      title="入库排行榜"
    >
      <Tabs
        className="gap-3"
        onValueChange={(value) => isRankingPeriod(value) && setPeriod(value)}
        value={period}
      >
        <div className="flex items-center justify-between gap-3">
          <TabsList aria-label="排行榜统计周期" className="h-7">
            {RANKING_PERIODS.map((item) => (
              <TabsTrigger
                className="h-6 px-2.5 text-xs sm:h-6"
                key={item.value}
                value={item.value}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
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
        <div className="relative">
          {RANKING_PERIODS.map((item) => (
            <TabsContent key={item.value} motion="page" value={item.value}>
              <UploaderRankingPanel period={item.value} ranking={rankings[item.value]} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
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
        fill: CONVERSION_ACCENT,
        key: "withInterview",
        label: "已发起 AI 面试",
        value: conversion.withInterview,
      },
      {
        fill: CONVERSION_ACCENT_MUTED,
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
                  style={{ backgroundColor: CONVERSION_ACCENT }}
                />
                <span className="flex-1 truncate">已发起 AI 面试</span>
                <span className="tabular-nums">{conversion.withInterview}</span>
              </li>
              <li className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: CONVERSION_ACCENT_MUTED }}
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
  fixedRecruitingGroup,
  onRefresh,
}: {
  chartKey?: string;
  isRefreshing?: boolean;
  metrics: ResumeLibraryMetrics;
  fixedRecruitingGroup?: string;
  onRefresh?: () => Promise<void>;
}) {
  const preset = recruitingBoardStagePresets.find((item) => item.id === fixedRecruitingGroup);
  if (preset) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard
          byPipeline={metrics.byPipeline}
          compact
          description={preset.id === "closed" ? "包含已归档候选人" : undefined}
          distribution={metrics.boardStatusCounts ?? []}
          key={`status:${chartKey ?? "metrics"}`}
          title={`${preset.label} · 流程分布`}
        />
        <BoardStatusCard
          counts={metrics.boardStatusCounts ?? []}
          stageLabel={preset.label}
          key={`board-status:${chartKey ?? "metrics"}`}
        />
      </div>
    );
  }

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
