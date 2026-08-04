/* eslint-disable react-dom/no-dangerously-set-innerhtml */
"use client";

import * as React from "react";
import { Chart as TanStackChart } from "@tanstack/react-charts";
import { Chart as TanStackTooltipChart } from "@tanstack/react-charts/tooltip";
import { tooltip as tanstackTooltip } from "@tanstack/charts/tooltip";
import { cn } from "@arc/shared/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { dark: ".dark", light: "" } as const;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.use(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

/**
 * Application-facing chart frame: injects CSS color tokens from `config`
 * and hosts a TanStack Charts surface. Pass either `children` or a TanStack
 * `Chart` / `TooltipChart` as the child.
 */
function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
}) {
  const uniqueId = React.useId();
  // eslint-disable-next-line e18e/prefer-static-regex
  const chartId = `chart-${id || uniqueId.replaceAll(":", "")}`;

  return (
    <ChartContext value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex w-full min-w-0 justify-center text-muted-foreground text-xs [&_svg]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {children}
      </div>
    </ChartContext>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.theme || item.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
}

/** Resolve a series color token produced by ChartStyle (`--color-<key>`). */
function chartColor(key: string): string {
  return `var(--color-${key})`;
}

/**
 * Shared native tooltip extension styled for the app shell.
 * Prefer formatters / `items` on the definition when possible.
 */
const chartTooltip = {
  use: tanstackTooltip,
  className: "arc-ts-chart-tooltip",
  sticky: false as const,
};

export {
  ChartContainer,
  ChartStyle,
  TanStackChart as Chart,
  TanStackTooltipChart as TooltipChart,
  chartColor,
  chartTooltip,
  useChart,
};
