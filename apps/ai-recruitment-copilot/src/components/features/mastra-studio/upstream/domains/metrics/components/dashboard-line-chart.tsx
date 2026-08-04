import { useMemo } from "react";
import { defineChart, lineY } from "@tanstack/charts";
import { scaleLinear, scalePoint } from "d3-scale";
import { Chart } from "@tanstack/react-charts";
import { tooltip } from "@tanstack/charts/tooltip";

const LABEL_COLOR = "#a1a1aa";

interface Series {
  dataKey: string;
  label: string;
  color: string;
  aggregate?: (data: Record<string, unknown>[]) => { value: string; suffix?: string };
}

export function DashboardLineChart({
  data,
  series,
  height = 200,
  yDomain,
}: {
  data: Record<string, unknown>[];
  series: Series[];
  height?: number;
  yDomain?: [number, number];
}) {
  const longRows = useMemo(
    () =>
      data.flatMap((row) =>
        series.map((item) => ({
          color: item.color,
          label: item.label,
          series: item.dataKey,
          time: String(row.time ?? ""),
          value: Number(row[item.dataKey] ?? 0),
        })),
      ),
    [data, series],
  );

  const definition = useMemo(() => {
    const times = data.map((row) => String(row.time ?? ""));
    const tickValues = times.filter((_, index) => index % 6 === 0);
    return defineChart({
      margin: { bottom: 24, left: 30, right: 8, top: 8 },
      marks: series.map((item) =>
        lineY(
          longRows.filter((row) => row.series === item.dataKey),
          {
            key: (row) => `${row.time}:${row.series}`,
            stroke: item.color,
            strokeWidth: 2,
            x: "time",
            y: "value",
          },
        ),
      ),
      theme: {
        foreground: LABEL_COLOR,
        grid: "rgba(255,255,255,0.08)",
        muted: LABEL_COLOR,
      },
      tooltip: {
        className: "arc-ts-chart-tooltip",
        format: (point) => {
          const row = point.datum as (typeof longRows)[number];
          return `${row.time}\n${row.label}: ${row.value}`;
        },
        use: tooltip,
      },
      x: {
        axis: {
          ticks: {
            format: String,
            values: tickValues,
          },
        },
        scale: () => scalePoint<string>().padding(0.05),
      },
      y: {
        axis: {
          ticks: {
            format: String,
          },
        },
        grid: true,
        nice: !yDomain,
        scale: yDomain ? scaleLinear().domain(yDomain) : scaleLinear,
      },
    });
  }, [data, longRows, series, yDomain]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        {series.map((s) => {
          const aggregated = s.aggregate?.(data);
          return (
            <div key={s.dataKey}>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-ui-xs text-neutral3 uppercase">{s.label}</span>
              </div>
              {aggregated && (
                <p className="pl-5 text-ui-md text-neutral4">
                  {aggregated.value}
                  {aggregated.suffix && (
                    <span className="text-ui-sm text-neutral2"> {aggregated.suffix}</span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ height }}>
        <Chart
          ariaLabel="指标趋势"
          className="h-full w-full"
          definition={definition}
          height={height}
        />
      </div>
    </div>
  );
}
