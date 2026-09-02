"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { barX, barY, defineChart, dot, link, ruleX, ruleY } from "@tanstack/charts";
import { scaleBand, scaleLinear } from "d3-scale";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { JobDescriptionMetrics } from "@app/shared/job-descriptions";

/**
 * Chart choices (distinct forms + single interactive mark each):
 * - candidatesByJd  → vertical ranked bars (barY)
 * - completionByJd  → horizontal progress bars (muted track + filled barX)
 * - loadByInterviewer → horizontal lollipops (stem link + endpoint dot)
 *
 * Hover multi-ring cause: text/link/bar sharing the same datum object makes
 * focus match every mark via datum identity. Decorative layers use cloned
 * rows, and value labels live only in tooltips.
 */

const NAME_MAX = 10;
const CANDIDATE_BLUE = "var(--chart-1)";
const COMPLETION_CYAN = "var(--chart-3)";
const COMPLETION_TRACK = "color-mix(in oklab, var(--muted-foreground) 16%, transparent)";
const LOAD_AMBER = "var(--chart-4)";
const STEM_MUTED = "color-mix(in oklab, var(--muted-foreground) 45%, transparent)";

const candidateTooltipDatumSchema = z.object({
  count: z.number(),
  name: z.string(),
});
const completionTooltipDatumSchema = z.object({
  done: z.number(),
  name: z.string(),
  percent: z.number(),
  total: z.number(),
});
const interviewerTooltipDatumSchema = z.object({
  activeCandidates: z.number(),
  name: z.string(),
});

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

/** Clone rows so decorative marks do not share datum identity with interactive marks. */
function cloneRows<T extends object>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row }));
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

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const domain = data.map((row) => row.shortName);
    return defineChart({
      focus: "nearest-x",
      focusRing: true,
      margin: { bottom: 48, left: 36, right: 8, top: 8 },
      marks: [
        ruleY([0], { stroke: "var(--border)", strokeWidth: 1 }),
        barY(data, {
          fill: CANDIDATE_BLUE,
          fillOpacity: 0.9,
          key: "id",
          radius: 4,
          x: "shortName",
          y: "count",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = candidateTooltipDatumSchema.safeParse(point.datum);
          return result.success ? `${result.data.name}: ${result.data.count} 人` : "数据不可用";
        },
      },
      x: {
        axis: {
          line: false,
          tickLabels: {
            rotate: domain.length > 4 ? -28 : undefined,
            thin: false,
          },
          ticks: {
            format: String,
            size: 0,
            values: domain,
          },
        },
        scale: () => scaleBand<string>().domain(domain).paddingInner(0.28).paddingOuter(0.12),
      },
      y: {
        axis: {
          line: false,
          ticks: { count: 4, size: 0 },
        },
        grid: true,
        nice: true,
        scale: scaleLinear,
      },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
      metrics={[
        { label: "候选人", value: formatCompact(total) },
        { label: "峰值岗位", value: formatCompact(max) },
      ]}
      title="各岗位候选人数"
    >
      {hasData && definition ? (
        <ChartContainer className="aspect-auto w-full" config={candidatesConfig} style={{ height }}>
          <Chart
            ariaLabel="各岗位候选人数排名"
            className="w-full"
            definition={definition}
            height={height}
          />
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
          track: 100,
        }))
        .toSorted((left, right) => right.percent - left.percent),
    [rows],
  );
  const done = useMemo(() => data.reduce((sum, row) => sum + row.done, 0), [data]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.total, 0), [data]);
  const average = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasData = data.length > 0;
  const height = Math.max(120, Math.min(data.length * 36 + 24, 280));

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const domain = data.map((row) => row.shortName);
    // Cloned track rows so focus does not ring both track and fill for one job.
    const tracks = cloneRows(data);
    return defineChart({
      focus: "nearest-y",
      focusRing: true,
      margin: { bottom: 8, left: 88, right: 16, top: 4 },
      marks: [
        barX(tracks, {
          fill: COMPLETION_TRACK,
          key: (row) => `${row.id}-track`,
          radius: 5,
          x: "track",
          y: "shortName",
        }),
        barX(data, {
          fill: COMPLETION_CYAN,
          fillOpacity: 0.92,
          key: "id",
          radius: 5,
          x: "percent",
          y: "shortName",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = completionTooltipDatumSchema.safeParse(point.datum);
          return result.success
            ? `${result.data.name}: ${result.data.done} / ${result.data.total} 轮（${result.data.percent}%）`
            : "数据不可用";
        },
      },
      x: {
        axis: {
          line: false,
          ticks: {
            format: (value: number) => `${value}%`,
            size: 0,
            values: [0, 25, 50, 75, 100],
          },
        },
        grid: true,
        scale: scaleLinear().domain([0, 100]),
      },
      y: {
        axis: {
          line: false,
          tickLabels: { thin: false },
          ticks: {
            format: String,
            size: 0,
            values: domain,
          },
        },
        scale: () => scaleBand<string>().domain(domain).paddingInner(0.32).paddingOuter(0.12),
      },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
      metrics={[
        { label: "平均完成", value: `${average}%` },
        { label: "已完成", value: `${formatCompact(done)}/${formatCompact(total)}` },
      ]}
      title="各岗位面试完成率"
    >
      {hasData && definition ? (
        <ChartContainer className="aspect-auto w-full" config={completionConfig} style={{ height }}>
          <Chart
            ariaLabel="各岗位面试完成率"
            className="w-full"
            definition={definition}
            height={height}
          />
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

/** Horizontal lollipops: interviewer load endpoints with light visual weight. */
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

  const definition = useMemo(() => {
    if (!hasData) {
      return null;
    }
    const domain = data.map((row) => row.shortName);
    // Stem uses cloned rows so only the endpoint dot rings on focus.
    const stems = cloneRows(data);
    return defineChart({
      focus: "nearest-y",
      focusRing: true,
      margin: { bottom: 8, left: 88, right: 20, top: 4 },
      marks: [
        ruleX([0], { stroke: "var(--border)", strokeWidth: 1 }),
        link(stems, {
          key: (row) => `${row.id}-stem`,
          stroke: STEM_MUTED,
          strokeWidth: 1.5,
          x1: () => 0,
          x2: "activeCandidates",
          y1: "shortName",
          y2: "shortName",
        }),
        dot(data, {
          fill: LOAD_AMBER,
          key: "id",
          r: 5,
          x: "activeCandidates",
          y: "shortName",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const result = interviewerTooltipDatumSchema.safeParse(point.datum);
          return result.success
            ? `${result.data.name}: ${result.data.activeCandidates} 人进行中`
            : "数据不可用";
        },
      },
      x: {
        axis: {
          line: false,
          ticks: { count: 4, size: 0 },
        },
        grid: true,
        nice: true,
        scale: scaleLinear,
      },
      y: {
        axis: {
          line: false,
          tickLabels: { thin: false },
          ticks: {
            format: String,
            size: 0,
            values: domain,
          },
        },
        scale: () => scaleBand<string>().domain(domain).paddingInner(0.36).paddingOuter(0.14),
      },
    });
  }, [data, hasData]);

  return (
    <ChartCardShell
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
