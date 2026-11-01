"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DashboardActivityRow } from "@app/shared/studio-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
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
import { ACTIVITY_SERIES, getActivityChartData } from "./dashboard-activity";

const config: ChartConfig = Object.fromEntries(
  ACTIVITY_SERIES.map((series) => [series.key, { color: series.fill, label: series.label }]),
);

export function DashboardActivityCard({ activity }: { activity: DashboardActivityRow[] }) {
  const { data, domain, maximum, ticks } = useMemo(
    () => getActivityChartData(activity),
    [activity],
  );

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
        <ChartContainer
          aria-label="近 30 天招聘活动，纵轴为活动次数"
          className="aspect-auto h-60"
          config={config}
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ bottom: 8, left: 0, right: 8, top: 12 }}
            maxBarSize={24}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              ticks={domain.filter((_, index) => index % 10 === 0 || index === domain.length - 1)}
              tickFormatter={(day: string) => day.slice(5)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
              domain={[0, maximum]}
              ticks={ticks}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            {ACTIVITY_SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                fill={`var(--color-${series.key})`}
                stackId="activity"
                isAnimationActive={false}
              />
            ))}
          </BarChart>
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
