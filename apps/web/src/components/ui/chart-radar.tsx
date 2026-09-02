"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { defineChart } from "@tanstack/charts";
import {
  angleGrid,
  polar,
  radialArea,
  radialDot,
  radialGrid,
  radialLine,
} from "@tanstack/charts/polar";
import type { ChartTooltipBodyRenderContext } from "@tanstack/charts/react/tooltip";
import { scaleLinear, scalePoint } from "d3-scale";
import { curveLinearClosed } from "d3-shape";
import { cn } from "@app/shared/utils";
import {
  Chart,
  ChartContainer,
  TooltipChart,
  chartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

export interface RadarDimensionPoint {
  key: string;
  label: string;
  score: number | null;
  /** Optional tooltip fields (weight, rationale, contribution, …). */
  weight?: number;
  rationale?: string;
  contribution?: number;
}

/**
 * The light theme follows the illustration green; dark mode keeps the original
 * Klein-blue radar color.
 */
const DEFAULT_CONFIG: ChartConfig = {
  score: {
    label: "评分",
    theme: {
      dark: "#7699ef",
      light: "#a3d387",
    },
  },
};

const GRID_STROKE = "#cccccc";
const GRID_STROKE_SOFT = "#cccccc";

export function DimensionRadarChart({
  dimensions,
  className,
  compact = false,
  config = DEFAULT_CONFIG,
  ariaLabel = "维度评分雷达图",
  fillOpacity = 0.16,
  height: heightProp,
  maxScore = 100,
  empty,
  tooltipBody,
}: {
  dimensions: readonly RadarDimensionPoint[];
  className?: string;
  compact?: boolean;
  config?: ChartConfig;
  ariaLabel?: string;
  fillOpacity?: number;
  /** Keep the renderer height aligned with a caller-provided compact host height. */
  height?: number;
  /** Maximum radial value. Qualitative charts use four ordered levels. */
  maxScore?: number;
  empty?: ReactNode;
  tooltipBody?: (point: RadarDimensionPoint) => ReactNode;
}) {
  const scored = useMemo(
    () =>
      dimensions.map((dimension) => ({
        ...dimension,
        score: dimension.score ?? 0,
      })),
    [dimensions],
  );

  const labels = useMemo(() => scored.map((row) => row.label), [scored]);
  const orderAttr = scored.map((row) => row.key).join(",");

  const definition = useMemo(() => {
    if (scored.length === 0) {
      return null;
    }

    return defineChart({
      marks: [
        polar({
          radiusRatio: compact ? 0.68 : 0.72,
          angle: {
            scale: scalePoint<string>().domain(labels),
            wrap: true,
          },
          radius: {
            scale: scaleLinear().domain([0, maxScore]),
          },
          guides: [
            radialGrid({
              ticks: 4,
              shape: "polygon",
              labels: false,
              stroke: GRID_STROKE_SOFT,
              strokeOpacity: 1,
              strokeWidth: 1,
            }),
            angleGrid({
              labels: true,
              stroke: GRID_STROKE,
              strokeOpacity: 0.85,
              strokeWidth: 1,
              labelFill: "var(--muted-foreground)",
              labelFontSize: compact ? 10 : 11,
              labelDx: ({ x }) => (x < -1 ? -3 : x > 1 ? 3 : 0),
              labelDy: ({ y }) => (y < -1 ? -2 : y > 1 ? 2 : 0),
            }),
          ],
          marks: [
            radialArea(scored, {
              angle: "label",
              radius: "score",
              curve: curveLinearClosed,
              fill: "var(--color-score)",
              fillOpacity,
            }),
            radialLine(scored, {
              angle: "label",
              radius: "score",
              curve: curveLinearClosed,
              stroke: "var(--color-score)",
              strokeOpacity: 0.92,
              strokeWidth: 1.75,
            }),
            radialDot(scored, {
              angle: "label",
              radius: "score",
              key: "key",
              r: compact ? 2.25 : 2.75,
              fill: "var(--color-score)",
              fillOpacity: 0.95,
              stroke: "var(--background)",
              strokeWidth: 1.25,
            }),
          ],
        }),
      ],
      theme: {
        foreground: "var(--muted-foreground)",
        muted: "var(--muted-foreground)",
        grid: GRID_STROKE,
        background: "transparent",
      },
      tooltip: tooltipBody
        ? {
            use: chartTooltip.use,
            className: chartTooltip.className,
            sticky: chartTooltip.sticky,
            format: (point) => {
              const datum = point.datum as RadarDimensionPoint;
              return `${datum.label}: ${datum.score ?? "—"}`;
            },
          }
        : {
            ...chartTooltip,
            format: (point) => {
              const datum = point.datum as RadarDimensionPoint;
              return `${datum.label}: ${datum.score ?? "—"} 分`;
            },
          },
    });
  }, [compact, fillOpacity, labels, maxScore, scored, tooltipBody]);

  if (scored.length === 0 || !definition) {
    return (
      empty ?? (
        <div
          className={cn(
            "flex w-full min-w-0 items-center justify-center text-muted-foreground text-sm",
            compact ? "min-h-48" : "min-h-64",
          )}
        >
          暂无匹配维度
        </div>
      )
    );
  }

  const height = heightProp ?? (compact ? 192 : 272);
  const ChartComponent = tooltipBody ? TooltipChart : Chart;

  return (
    <ChartContainer
      className={cn(
        "mx-auto aspect-square w-full text-muted-foreground",
        compact ? "min-h-[12rem] max-w-[14rem]" : "min-h-[16rem] max-w-[19rem] lg:min-h-[17rem]",
        className,
      )}
      config={config}
      data-radar-max-score={maxScore}
      data-radar-order={orderAttr}
    >
      <ChartComponent
        ariaLabel={ariaLabel}
        className="size-full"
        definition={definition}
        height={height}
        {...(tooltipBody
          ? {
              renderTooltipBody: ({ points }: ChartTooltipBodyRenderContext) => {
                const point = points[0]?.datum as RadarDimensionPoint | undefined;
                if (!point) {
                  return null;
                }
                return tooltipBody(point);
              },
            }
          : {})}
      />
    </ChartContainer>
  );
}
