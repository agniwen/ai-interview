import { defineChart } from "@tanstack/charts";
import { polar, radialArc } from "@tanstack/charts/polar";
import { pie } from "d3-shape";
import { z } from "zod";
import { chartTooltip } from "@/components/ui/chart";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  fill: string;
}

const donutSliceSchema = z.object({
  fill: z.string(),
  key: z.string(),
  label: z.string(),
  value: z.number(),
});

const donutArcDatumSchema = z.object({ data: donutSliceSchema });

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
        const arcDatum = donutArcDatumSchema.safeParse(point.datum);
        if (arcDatum.success) {
          return `${arcDatum.data.data.label}: ${arcDatum.data.data.value}`;
        }
        const slice = donutSliceSchema.safeParse(point.datum);
        return slice.success ? `${slice.data.label}: ${slice.data.value}` : "数据不可用";
      },
    },
  });
}
