"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { JobDescriptionMetrics } from "@app/shared/job-descriptions";

const NAME_MAX = 10;
const CANDIDATE_BLUE = "var(--chart-1)";
const COMPLETION_CYAN = "var(--chart-3)";
const COMPLETION_TRACK = "color-mix(in oklab, var(--muted-foreground) 16%, transparent)";
const LOAD_AMBER = "var(--chart-4)";

function EmptyHint({ message }: { message: string }) {
  return (
    <Empty className="h-24 border border-border p-4 md:p-4">
      <EmptyHeader>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function truncate(value: string, max = NAME_MAX): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
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
  metrics,
  children,
}: {
  title: string;
  metrics: [MetricItem, MetricItem];
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl py-0">
      <div className="grid border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <CardHeader className="min-w-0 gap-1 p-4 sm:p-5">
          <CardTitle className="truncate text-base">{title}</CardTitle>
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

const candidatesConfig: ChartConfig = {
  count: { color: CANDIDATE_BLUE, label: "候选人数" },
};

/** Vertical ranking: which jobs hold the most candidates. */
function CandidatesCard({ rows }: { rows: JobDescriptionMetrics["candidatesByJd"] }) {
  const data = useMemo(
    () =>
      rows
        .filter((row) => row.count > 0)
        .toSorted((left, right) => right.count - left.count)
        .map((row) => ({ ...row, shortName: truncate(row.name) })),
    [rows],
  );
  const total = useMemo(() => data.reduce((sum, row) => sum + row.count, 0), [data]);
  const max = useMemo(() => Math.max(0, ...data.map((row) => row.count)), [data]);
  const hasData = data.length > 0;
  const height = 220;

  return (
    <ChartCardShell
      metrics={[
        { label: "候选人", value: formatCompact(total) },
        { label: "峰值岗位", value: formatCompact(max) },
      ]}
      title="各岗位候选人数"
    >
      {hasData ? (
        <ChartContainer
          aria-label="各岗位候选人数排名"
          className="aspect-auto w-full"
          config={candidatesConfig}
          style={{ height }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ bottom: 20, left: 0, right: 8, top: 8 }}
            maxBarSize={40}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="id"
              tickFormatter={(id: string) => data.find((row) => row.id === id)?.shortName ?? id}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={data.length > 4 ? -28 : 0}
              textAnchor={data.length > 4 ? "end" : "middle"}
              height={44}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload[0]?.payload.name}
                  formatter={(value) => `${value} 人`}
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <EmptyHint message="还没有岗位收到候选人" />
      )}
    </ChartCardShell>
  );
}

const completionConfig: ChartConfig = {
  percent: { color: COMPLETION_CYAN, label: "完成率" },
};

/** Horizontal progress bars: completion share per job (0–100%). */
function CompletionCard({ rows }: { rows: JobDescriptionMetrics["completionByJd"] }) {
  const data = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          percent: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0,
          shortName: truncate(row.name),
        }))
        .toSorted((left, right) => right.percent - left.percent),
    [rows],
  );
  const done = useMemo(() => data.reduce((sum, row) => sum + row.done, 0), [data]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.total, 0), [data]);
  const average = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasData = data.length > 0;
  const height = Math.max(120, Math.min(data.length * 36 + 24, 280));

  return (
    <ChartCardShell
      metrics={[
        { label: "平均完成", value: `${average}%` },
        { label: "已完成", value: `${formatCompact(done)}/${formatCompact(total)}` },
      ]}
      title="各岗位面试完成率"
    >
      {hasData ? (
        <ChartContainer
          aria-label="各岗位面试完成率"
          className="aspect-auto w-full"
          config={completionConfig}
          style={{ height }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ bottom: 4, left: 0, right: 38, top: 4 }}
            maxBarSize={20}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="id"
              width={88}
              tickFormatter={(id: string) => data.find((row) => row.id === id)?.shortName ?? id}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload[0]?.payload.name}
                  formatter={(_, __, item) =>
                    `${item.payload.done} / ${item.payload.total} 轮（${item.payload.percent}%）`
                  }
                />
              }
            />
            <Bar
              dataKey="percent"
              minPointSize={1}
              fill="var(--color-percent)"
              background={{ fill: COMPLETION_TRACK, radius: 5 }}
              radius={5}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="percent"
                position="right"
                formatter={(value) => `${value}%`}
                fill="var(--muted-foreground)"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <EmptyHint message="还没有面试轮次数据" />
      )}
    </ChartCardShell>
  );
}

const loadConfig: ChartConfig = {
  activeCandidates: { color: LOAD_AMBER, label: "进行中候选人" },
};

/** Horizontal bars compare interviewer load on the same count scale. */
function LoadCard({ rows }: { rows: JobDescriptionMetrics["loadByInterviewer"] }) {
  const data = useMemo(
    () =>
      rows
        .toSorted((left, right) => right.activeCandidates - left.activeCandidates)
        .map((row) => ({ ...row, shortName: truncate(row.name) })),
    [rows],
  );
  const total = useMemo(() => data.reduce((sum, row) => sum + row.activeCandidates, 0), [data]);
  const max = useMemo(() => Math.max(0, ...data.map((row) => row.activeCandidates)), [data]);
  const hasData = data.length > 0;
  const height = Math.max(120, Math.min(data.length * 36 + 24, 280));

  return (
    <ChartCardShell
      metrics={[
        { label: "总负载", value: formatCompact(total) },
        { label: "最高负载", value: formatCompact(max) },
      ]}
      title="面试官负载"
    >
      {hasData ? (
        <ChartContainer
          aria-label="面试官负载"
          className="aspect-auto w-full"
          config={loadConfig}
          style={{ height }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ bottom: 4, left: 0, right: 32, top: 4 }}
            maxBarSize={20}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              domain={[0, (maximum: number) => Math.max(1, maximum)]}
            />
            <YAxis
              type="category"
              dataKey="id"
              width={88}
              tickFormatter={(id: string) => data.find((row) => row.id === id)?.shortName ?? id}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload[0]?.payload.name}
                  formatter={(value) => `${value} 人进行中`}
                />
              }
            />
            <Bar
              dataKey="activeCandidates"
              minPointSize={1}
              fill="var(--color-activeCandidates)"
              radius={5}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="activeCandidates"
                position="right"
                fill="var(--muted-foreground)"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <EmptyHint message="目前没有进行中的面试" />
      )}
    </ChartCardShell>
  );
}

export function JobDescriptionCharts({ metrics }: { metrics: JobDescriptionMetrics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <CandidatesCard rows={metrics.candidatesByJd} />
      <CompletionCard rows={metrics.completionByJd} />
      <LoadCard rows={metrics.loadByInterviewer} />
    </div>
  );
}
