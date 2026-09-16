"use client";

import { useMemo } from "react";
import { barY, defineChart, stack } from "@tanstack/charts";
import { scaleBand, scaleLinear } from "d3-scale";
import { z } from "zod";
import type { DashboardActivityRow } from "@app/shared/studio-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chart, ChartContainer, chartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACTIVITY_SERIES, formatActivityTooltip, getActivityChartData } from "./dashboard-activity";

const activityDatumSchema = z.object({
  aiCompleted: z.number(),
  day: z.string(),
  humanCompleted: z.number(),
  offersSent: z.number(),
  resumesAdded: z.number(),
});

const config: ChartConfig = Object.fromEntries(
  ACTIVITY_SERIES.map((series) => [series.key, { color: series.fill, label: series.label }]),
);

export function DashboardActivityCard({ activity }: { activity: DashboardActivityRow[] }) {
  const definition = useMemo(() => {
    const { data, domain, maximum, ticks } = getActivityChartData(activity);
    return defineChart({
      focus: "nearest-x",
      focusRing: true,
      margin: { bottom: 32, left: 40, right: 8, top: 12 },
      marks: [
        barY(data, {
          fill: (row) => row.color,
          key: (row) => `${row.day}-${row.series}`,
          layout: stack({ order: ACTIVITY_SERIES.map((series) => series.key) }),
          maxThickness: 24,
          x: "day",
          y: "value",
          z: "series",
        }),
      ],
      tooltip: {
        ...chartTooltip,
        format: (point) => {
          const parsed = activityDatumSchema.safeParse(point.datum);
          return parsed.success ? formatActivityTooltip(parsed.data) : "数据不可用";
        },
      },
      x: {
        axis: {
          line: false,
          ticks: {
            format: (value) => String(value).slice(5),
            size: 0,
            values: domain.filter((_, index) => index % 10 === 0 || index === domain.length - 1),
          },
        },
        scale: () => scaleBand<string>().domain(domain).padding(0.25),
      },
      y: {
        axis: { line: false, ticks: { format: String, size: 0, values: ticks } },
        grid: true,
        scale: () => scaleLinear().domain([0, maximum]),
      },
    });
  }, [activity]);

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">近 30 天招聘活动</CardTitle>
        <p className="text-muted-foreground text-xs">北京时间自然日 · 活动次数，按日堆叠</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {ACTIVITY_SERIES.map((series) => (
            <span
              className="flex items-center gap-1.5 text-muted-foreground text-xs"
              key={series.key}
            >
              <span className={`size-2 rounded-full ${series.background}`} />
              {series.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <ChartContainer className="h-60" config={config}>
          <Chart
            ariaLabel="近 30 天招聘活动，纵轴为活动次数"
            className="w-full"
            definition={definition}
            height={240}
          />
        </ChartContainer>
        <details className="mt-2 text-xs">
          <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            查看每日明细
          </summary>
          <div className="mt-3">
            <Table className="text-right text-xs tabular-nums">
              <TableCaption className="sr-only">近 30 天各类招聘活动次数</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 text-left" scope="col">
                    日期
                  </TableHead>
                  {ACTIVITY_SERIES.map((series) => (
                    <TableHead
                      className="px-2 py-2 text-right font-medium"
                      key={series.key}
                      scope="col"
                    >
                      {series.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((row) => (
                  <TableRow className="border-t" key={row.day}>
                    <TableHead className="whitespace-nowrap py-2 text-left font-normal" scope="row">
                      {row.day}
                    </TableHead>
                    {ACTIVITY_SERIES.map((series) => (
                      <TableCell className="px-2 py-2" key={series.key}>
                        {row[series.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
