"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, Treemap, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobDescriptionMetrics } from "@/lib/shared/job-descriptions";

// 截断 Y 轴标签：JD / 面试官名常常较长，超过这个长度的尾巴用 … 替换，hover 看全名。
// Truncate names on the Y axis — JD/interviewer names are often long; the
// tooltip shows the full string anyway.
const NAME_MAX = 10;

// 五色循环：Treemap / RadialBar 都用这套色，确保两张图视觉一致、又能互相区分单元。
// Shared 5-tone palette used by both Treemap and RadialBar so the two cards
// look like part of one system, but with enough hue variety to tell cells apart.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// 竖条 X 轴的 JD 名需要更短的截断 —— 横向空间被多条 bar 平分，每个名字只剩很窄的一格。
// JD names on the vertical-bar X axis get a tighter truncation: many bars
// share the horizontal axis, so each tick only owns a narrow slot.
const X_AXIS_NAME_MAX = 6;

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
      {message}
    </div>
  );
}

function truncate(value: string): string {
  return value.length > NAME_MAX ? `${value.slice(0, NAME_MAX)}…` : value;
}

// recharts 的 tooltip `payload` 是 `Record<string, unknown>[]`，name 是我们自己塞的。
// recharts types tooltip payload as Record<string, unknown>[]; the `name` we
// embed is a row-side field, so we extract a helper instead of repeating the cast.
function fullNameFromPayload(payload: Record<string, unknown>[] | undefined): string {
  const row = payload?.[0]?.payload as { name?: unknown } | undefined;
  return typeof row?.name === "string" ? row.name : "";
}

// =============================================================================
// E · 各岗位候选人数 —— Treemap
// =============================================================================

const candidatesConfig: ChartConfig = {
  count: { color: "var(--chart-1)", label: "候选人数" },
};

// Treemap 单元的自定义渲染：小到一定面积就不画文字，避免叠在一起糊成块。
// Custom treemap cell renderer; hides labels when the cell is too small to
// fit readable text without overlapping its neighbours.
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
  // Treemap 只接 size > 0 的节点；0 候选 JD 也没必要画出来。
  // Drop zero-count nodes — Treemap only accepts positive sizes anyway.
  const data = useMemo(() => rows.filter((row) => row.count > 0), [rows]);
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>各岗位候选人数</CardTitle>
        <CardDescription>
          {hasData ? `Top ${data.length}（面积越大、候选人越多）` : "暂无候选人"}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              {/*
                Treemap 节点的 payload 没有 dataKey 字段，ChartTooltipContent 用
                `item.dataKey` 当 React key 会拿到 undefined 触发 list-key 警告。
                这里直接用 recharts 原生 Tooltip + 自定义渲染绕开。
                Treemap payload items don't carry a `dataKey`; ChartTooltipContent
                uses it as React `key` and warns. Render a minimal custom tooltip
                with recharts' raw Tooltip instead.
              */}
              <Tooltip content={<TreemapTooltip />} cursor={false} />
            </Treemap>
          </ChartContainer>
        ) : (
          <EmptyHint message="还没有岗位收到候选人" />
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// F · 各岗位面试完成率 —— 垂直 bar（0–100%）
// =============================================================================

const completionConfig: ChartConfig = {
  percent: { color: "var(--chart-2)", label: "完成率" },
};

function truncateAxis(value: string): string {
  return value.length > X_AXIS_NAME_MAX ? `${value.slice(0, X_AXIS_NAME_MAX)}…` : value;
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
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>各岗位面试完成率</CardTitle>
        <CardDescription>{hasData ? `Top ${data.length}` : "暂无面试轮次"}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer className="aspect-auto h-56 w-full" config={completionConfig}>
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ bottom: 4, left: -16, right: 8, top: 12 }}
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
                width={40}
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
      </CardContent>
    </Card>
  );
}

// =============================================================================
// H · 面试官负载 —— 横向 bar（保留排行榜语义）
// =============================================================================

const loadConfig: ChartConfig = {
  activeCandidates: { color: "var(--chart-3)", label: "进行中候选人" },
};

// Recharts 类目轴在 layout=vertical 下需要根据数据条数手动估算高度，
// 否则条目稀少时图会被压扁、条目过多时又会挤在一起。
// In vertical layout recharts doesn't auto-size; pick a height proportional
// to the row count so few-bar charts don't squash and many-bar ones don't pack.
function rowsHeight(count: number) {
  return Math.max(96, Math.min(count * 32 + 16, 280));
}

function LoadCard({ rows }: { rows: JobDescriptionMetrics["loadByInterviewer"] }) {
  const data = useMemo(
    () => rows.map((row) => ({ ...row, shortName: truncate(row.name) })),
    [rows],
  );
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>面试官负载</CardTitle>
        <CardDescription>
          {hasData ? `Top ${data.length}（进行中 / 待面试）` : "暂无进行中面试"}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
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
