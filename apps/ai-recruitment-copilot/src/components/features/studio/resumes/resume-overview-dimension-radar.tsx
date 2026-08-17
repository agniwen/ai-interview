"use client";

import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { cn } from "@arc/shared/utils";
import type { ReviewDimensionDisplay } from "./resume-review-display";

/** Plain empty copy for unevaluated review cards — no badge/border chrome. */
export function UnevaluatedText({ className }: { className?: string }) {
  return <p className={cn("text-muted-foreground text-sm leading-6", className)}>未评估</p>;
}

export function OverviewDimensionRadar({
  compact = false,
  dimensions,
  showTooltip = true,
}: {
  compact?: boolean;
  dimensions: ReviewDimensionDisplay[];
  showTooltip?: boolean;
}) {
  if (dimensions.length === 0) {
    return (
      <div
        className={cn(
          "flex w-full min-w-0 items-center justify-center",
          compact ? "min-h-48" : "min-h-64",
        )}
      >
        <UnevaluatedText />
      </div>
    );
  }

  return (
    <DimensionRadarChart
      ariaLabel="简历维度评分雷达图"
      compact={compact}
      dimensions={dimensions}
      tooltipBody={
        showTooltip
          ? (payload) => (
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-foreground">
                  {payload.label}：{String(payload.score ?? "—")}
                </div>
                <div className="text-muted-foreground text-xs leading-5">
                  权重 {String(payload.weight ?? "—")}%
                  {typeof payload.rationale === "string" ? ` · ${payload.rationale}` : ""}
                </div>
              </div>
            )
          : undefined
      }
    />
  );
}
