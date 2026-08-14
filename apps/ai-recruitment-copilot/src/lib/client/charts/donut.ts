import { defineChart } from "@tanstack/charts";
import { polar, radialArc } from "@tanstack/charts/polar";
import { pie } from "d3-shape";
import { chartTooltip } from "@/components/ui/chart";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  fill: string;
}

export function defineDonutChart(
  slices: readonly DonutSlice[],
  options?: {
    innerRatio?: number;
    cornerRadius?: number;
    padAngle?: number;
  },
) {
  const innerRatio = options?.innerRatio ?? 0.62;
  const cornerRadius = options?.cornerRadius ?? 8;
  // Call d3 pie layout order via bracket access so Array#toSorted autofixers
  // cannot rewrite the layout comparator API.
  const layoutMethod = "sort" as const;
  const pieLayout = pie<DonutSlice>()
    .value((row) => row.value)
    .padAngle(options?.padAngle ?? 0.04);
  const layout = pieLayout[layoutMethod](null);

  const arcs = layout(slices.filter((slice) => slice.value > 0));

  return defineChart({
    marks: [
      polar({
        inset: 4,
        marks: [
          radialArc(arcs, {
            cornerRadius,
            endAngle: "endAngle",
            fill: (slice) => slice.data.fill,
            innerRadius: ({ radius }) => radius * innerRatio,
            key: (slice) => slice.data.key,
            padAngle: "padAngle",
            startAngle: "startAngle",
          }),
        ],
        radiusRatio: 0.92,
      }),
    ],
    tooltip: {
      ...chartTooltip,
      format: (point) => {
        const slice = point.datum as { data?: DonutSlice } | DonutSlice;
        const data = "data" in slice && slice.data ? slice.data : (slice as DonutSlice);
        return `${data.label}: ${data.value}`;
      },
    },
  });
}
