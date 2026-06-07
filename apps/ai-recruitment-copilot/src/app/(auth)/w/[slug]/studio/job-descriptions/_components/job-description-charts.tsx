"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, Treemap, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { JobDescriptionMetrics } from "@arc/shared/job-descriptions";

const NAME_MAX = 10;
const X_AXIS_NAME_MAX = 6;

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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

function fullNameFromPayload(payload: Record<string, unknown>[] | undefined): string {
  const row = payload?.[0]?.payload as { name?: unknown } | undefined;
  return typeof row?.name === "string" ? row.name : "";
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

const candidatesConfig: ChartConfig = {
  count: { color: "var(--chart-1)", label: "候选人数" },
};

interface TreemapCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  value?: number;
}

function CandidatesTreemapCell(props: TreemapCellProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name = "", value = 0 } = props;
  const fill = PALETTE[index % PALETTE.length];
  const showLabel = width > 64 && height > 36;
  const showCount = width > 40 && height > 22;

  return (
    <g>
      <rect
        fill={fill}
        height={height}
        rx={4}
        stroke="var(--background)"
        strokeWidth={2}
        width={width}
        x={x}
        y={y}
      />
      {showLabel ? (
        <text
          className="pointer-events-none fill-primary-foreground text-[11px]"
          textAnchor="start"
          x={x + 8}
          y={y + 16}
        >
          {truncate(name)}
        </text>
      ) : null}
      {showCount ? (
        <text
          className="pointer-events-none fill-primary-foreground/80 text-[10px] tabular-nums"
          textAnchor="start"
          x={x + 8}
          y={y + height - 8}
        >
          {value}
        </text>
      ) : null}
    </g>
  );
}

interface TreemapTooltipProps {
  active?: boolean;
  payload?: { payload?: { name?: unknown; count?: unknown } }[];
}

function TreemapTooltip({ active, payload }: TreemapTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }
  const name = typeof row.name === "string" ? row.name : "";
  const count = typeof row.count === "number" ? row.count : 0;
  return (
    <div className="grid min-w-[8rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{name}</div>
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span>候选人数</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{count} 人</span>
      </div>
    </div>
  );
}

function CandidatesCard({ rows }: { rows: JobDescriptionMetrics["candidatesByJd"] }) {
  const data = useMemo(() => rows.filter((row) => row.count > 0), [rows]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.count, 0), [data]);
  const max = useMemo(() => Math.max(0, ...data.map((row) => row.count)), [data]);
  const hasData = data.length > 0;

  return (
    <ChartCardShell
      description={hasData ? "面积越大，候选人越多" : "暂无候选人"}
      metrics={[
        { label: "候选人", value: formatCompact(total) },
        { label: "峰值岗位", value: formatCompact(max) },
      ]}
      title="各岗位候选人数"
    >
      {hasData ? (
        <ChartContainer className="aspect-auto h-56 w-full" config={candidatesConfig}>
          <Treemap
            animationDuration={300}
            content={<CandidatesTreemapCell />}
            data={data.map((row) => ({ count: row.count, id: row.id, name: row.name }))}
            dataKey="count"
            nameKey="name"
            stroke="var(--background)"
          >
            <Tooltip content={<TreemapTooltip />} cursor={false} />
          </Treemap>
        </ChartContainer>
      ) : (
        <EmptyHint message="还没有岗位收到候选人" />
      )}
    </ChartCardShell>
  );
}

const COMPLETION_GREEN = "oklch(0.65 0.16 150)";

const completionConfig: ChartConfig = {
  percent: { color: COMPLETION_GREEN, label: "完成率" },
};

function truncateAxis(value: string): string {
  return truncate(value, X_AXIS_NAME_MAX);
}

function CompletionCard({ rows }: { rows: JobDescriptionMetrics["completionByJd"] }) {
  const data = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        percent: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0,
        shortName: truncateAxis(row.name),
      })),
    [rows],
  );
  const done = useMemo(() => data.reduce((sum, row) => sum + row.done, 0), [data]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.total, 0), [data]);
  const average = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasData = data.length > 0;

  return (
    <ChartCardShell
      description={hasData ? "完成轮次 / 总轮次" : "暂无面试轮次"}
      metrics={[
        { label: "平均完成", value: `${average}%` },
        { label: "已完成", value: `${formatCompact(done)}/${formatCompact(total)}` },
      ]}
      title="各岗位面试完成率"
    >
      {hasData ? (
        <ChartContainer className="aspect-auto h-56 w-full" config={completionConfig}>
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ bottom: 4, left: 4, right: 8, top: 24 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="shortName"
              interval={0}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              axisLine={false}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tickLine={false}
              tickMargin={4}
              ticks={[0, 25, 50, 75, 100]}
              width={36}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => {
                    const payload = item.payload as {
                      done: number;
                      total: number;
                      percent: number;
                    };
                    return `${payload.done} / ${payload.total} 轮（${payload.percent}%）`;
                  }}
                  indicator="dot"
                  labelFormatter={(_value, payload) => fullNameFromPayload(payload)}
                />
              }
            />
            <Bar dataKey="percent" fill="var(--color-percent)" radius={[4, 4, 0, 0]}>
              <LabelList
                className="fill-foreground text-[10px] tabular-nums"
                dataKey="percent"
                formatter={(value: unknown) => `${value}%`}
                offset={6}
                position="top"
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

const LOAD_ORANGE = "oklch(0.72 0.16 55)";

const loadConfig: ChartConfig = {
  activeCandidates: { color: LOAD_ORANGE, label: "进行中候选人" },
};

function rowsHeight(count: number) {
  return Math.max(96, Math.min(count * 32 + 16, 280));
}

function LoadCard({ rows }: { rows: JobDescriptionMetrics["loadByInterviewer"] }) {
  const data = useMemo(
    () => rows.map((row) => ({ ...row, shortName: truncate(row.name) })),
    [rows],
  );
  const total = useMemo(() => data.reduce((sum, row) => sum + row.activeCandidates, 0), [data]);
  const max = useMemo(() => Math.max(0, ...data.map((row) => row.activeCandidates)), [data]);
  const hasData = data.length > 0;

  return (
    <ChartCardShell
      description={hasData ? "进行中 / 待面试候选人" : "暂无进行中面试"}
      metrics={[
        { label: "总负载", value: formatCompact(total) },
        { label: "最高负载", value: formatCompact(max) },
      ]}
      title="面试官负载"
    >
      {hasData ? (
        <ChartContainer
          className="aspect-auto w-full"
          config={loadConfig}
          style={{ height: rowsHeight(data.length) }}
        >
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ right: 24 }}>
            <CartesianGrid horizontal={false} />
            <XAxis allowDecimals={false} hide type="number" />
            <YAxis
              axisLine={false}
              dataKey="shortName"
              tickLine={false}
              tickMargin={4}
              type="category"
              width={88}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_value, payload) => fullNameFromPayload(payload)}
                />
              }
            />
            <Bar
              dataKey="activeCandidates"
              fill="var(--color-activeCandidates)"
              radius={[0, 4, 4, 0]}
            >
              <LabelList
                className="fill-foreground text-[10px] tabular-nums"
                dataKey="activeCandidates"
                offset={6}
                position="right"
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
