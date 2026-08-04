"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { barX, barY, defineChart, rect, text } from "@tanstack/charts";
import { hierarchy, treemap } from "d3-hierarchy";
import { scaleBand, scaleLinear } from "d3-scale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartColor, chartTooltip } from "@/components/ui/chart";
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

interface TreemapCell {
  count: number;
  fill: string;
  id: string;
  labelX: number;
  labelY: number;
  name: string;
  showCount: boolean;
  showLabel: boolean;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

function layoutTreemap(
  rows: { count: number; id: string; name: string }[],
  width: number,
  height: number,
): TreemapCell[] {
  if (rows.length === 0) {
    return [];
  }

  interface TreeNode {
    children?: TreeNode[];
    count: number;
    id: string;
    name: string;
  }

  // Pre-sort by size so treemap places large cells first (avoids d3 root.sort,
  // which tools may confuse with Array#sort).
  const ordered = [...rows].toSorted((left, right) => right.count - left.count);
  const root = hierarchy<TreeNode>({
    children: ordered.map((row) => ({ count: row.count, id: row.id, name: row.name })),
    count: 0,
    id: "root",
    name: "root",
  }).sum((node) => (node.children ? 0 : node.count));

  const layoutRoot = treemap<TreeNode>().size([100, 100]).paddingInner(1.2).round(false)(root);

  return layoutRoot.leaves().map((leaf, index) => {
    const widthRatio = leaf.x1 - leaf.x0;
    const heightRatio = leaf.y1 - leaf.y0;
    const pixelWidth = (widthRatio / 100) * width;
    const pixelHeight = (heightRatio / 100) * height;
    return {
      count: leaf.data.count,
      fill: PALETTE[index % PALETTE.length] ?? PALETTE[0],
      id: leaf.data.id,
      labelX: (leaf.x0 + leaf.x1) / 2,
      labelY: (leaf.y0 + leaf.y1) / 2,
      name: leaf.data.name,
      showCount: pixelWidth > 40 && pixelHeight > 22,
      showLabel: pixelWidth > 64 && pixelHeight > 36,
      x1: leaf.x0,
      x2: leaf.x1,
      y1: leaf.y0,
      y2: leaf.y1,
    };
  });
}

function CandidatesCard({ rows }: { rows: JobDescriptionMetrics["candidatesByJd"] }) {
  const data = useMemo(() => rows.filter((row) => row.count > 0), [rows]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.count, 0), [data]);
  const max = useMemo(() => Math.max(0, ...data.map((row) => row.count)), [data]);
  const hasData = data.length > 0;

  // Fixed layout size used for label visibility heuristics; the chart still
  // fills its container width via the host.
  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const cells = layoutTreemap(
      data.map((row) => ({ count: row.count, id: row.id, name: row.name })),
      360,
      224,
    );
    const labeled = cells.filter((cell) => cell.showLabel);
    const counted = cells.filter((cell) => cell.showCount);

    return defineChart({
      color: {
        domain: cells.map((cell) => cell.id),
        range: cells.map((cell) => cell.fill),
      },
      guides: false,
      margin: 0,
      marks: [
        rect(cells, {
          color: "id",
          inset: 1,
          key: "id",
          radius: 4,
          stroke: "var(--background)",
          strokeWidth: 2,
          x1: "x1",
          x2: "x2",
          y1: "y1",
          y2: "y2",
        }),
        text(labeled, {
          anchor: "middle",
          fill: "var(--primary-foreground)",
          fontSize: 11,
          text: (cell) => truncate(cell.name),
          x: "labelX",
          y: (cell) => cell.labelY - 6,
        }),
        text(counted, {
          anchor: "middle",
          fill: "color-mix(in oklab, var(--primary-foreground) 80%, transparent)",
          fontSize: 10,
          text: (cell) => String(cell.count),
          x: "labelX",
          y: (cell) => cell.labelY + 10,
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const cell = point.datum as TreemapCell;
          return `${cell.name}: ${cell.count} 人`;
        },
      },
      x: { axis: false, scale: scaleLinear().domain([0, 100]) },
      y: { axis: false, scale: scaleLinear().domain([100, 0]) },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
      description={hasData ? "面积越大，候选人越多" : "暂无候选人"}
      metrics={[
        { label: "候选人", value: formatCompact(total) },
        { label: "峰值岗位", value: formatCompact(max) },
      ]}
      title="各岗位候选人数"
    >
      {hasData && definition ? (
        <ChartContainer className="aspect-auto h-56 w-full" config={candidatesConfig}>
          <Chart
            ariaLabel="各岗位候选人数"
            className="h-56 w-full"
            definition={definition}
            height={224}
          />
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

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    return defineChart({
      margin: { bottom: 28, left: 36, right: 8, top: 24 },
      marks: [
        barY(data, {
          fill: chartColor("percent"),
          key: "id",
          radius: 4,
          x: "shortName",
          y: "percent",
        }),
        text(data, {
          anchor: "middle",
          dy: -8,
          fill: "var(--foreground)",
          fontSize: 10,
          text: (row) => `${row.percent}%`,
          x: "shortName",
          y: "percent",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const row = point.datum as (typeof data)[number];
          return `${row.name}: ${row.done} / ${row.total} 轮（${row.percent}%）`;
        },
      },
      x: {
        axis: {
          ticks: { format: String },
        },
        scale: () => scaleBand().padding(0.22),
      },
      y: {
        axis: {
          ticks: {
            format: (value) => `${value}%`,
            values: [0, 25, 50, 75, 100],
          },
        },
        grid: true,
        scale: scaleLinear().domain([0, 100]),
      },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
      description={hasData ? "完成轮次 / 总轮次" : "暂无面试轮次"}
      metrics={[
        { label: "平均完成", value: `${average}%` },
        { label: "已完成", value: `${formatCompact(done)}/${formatCompact(total)}` },
      ]}
      title="各岗位面试完成率"
    >
      {hasData && definition ? (
        <ChartContainer className="aspect-auto h-56 w-full" config={completionConfig}>
          <Chart
            ariaLabel="各岗位面试完成率"
            className="h-56 w-full"
            definition={definition}
            height={224}
          />
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
  const height = rowsHeight(data.length);

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    return defineChart({
      margin: { bottom: 8, left: 88, right: 28, top: 4 },
      marks: [
        barX(data, {
          fill: chartColor("activeCandidates"),
          key: "id",
          radius: 4,
          x: "activeCandidates",
          y: "shortName",
        }),
        text(data, {
          anchor: "start",
          dx: 8,
          fill: "var(--foreground)",
          fontSize: 10,
          text: (row) => String(row.activeCandidates),
          x: "activeCandidates",
          y: "shortName",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const row = point.datum as (typeof data)[number];
          return `${row.name}: ${row.activeCandidates}`;
        },
      },
      x: {
        axis: false,
        nice: true,
        scale: scaleLinear,
      },
      y: {
        axis: {
          ticks: { format: String },
        },
        scale: () => scaleBand().padding(0.24),
      },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
      description={hasData ? "进行中 / 待面试候选人" : "暂无进行中面试"}
      metrics={[
        { label: "总负载", value: formatCompact(total) },
        { label: "最高负载", value: formatCompact(max) },
      ]}
      title="面试官负载"
    >
      {hasData && definition ? (
        <ChartContainer className="aspect-auto w-full" config={loadConfig} style={{ height }}>
          <Chart
            ariaLabel="面试官负载"
            className="w-full"
            definition={definition}
            height={height}
          />
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
