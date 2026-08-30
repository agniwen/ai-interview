"use client";

import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { Component } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { cn } from "@arc/shared/utils";
import { ResumeLibraryCharts } from "./resume-library-charts";
import { ResumeLibraryMetricsSkeleton } from "./resume-library-metrics-skeleton";

type MetricsRetry = () => Promise<void>;

function MetricsChartRenderer({
  metrics,
  renderCharts,
}: {
  metrics: ResumeLibraryMetrics;
  renderCharts: (metrics: ResumeLibraryMetrics) => ReactNode;
}) {
  return renderCharts(metrics);
}

function MetricsLoadError({ onRetry }: { onRetry: MetricsRetry }) {
  return (
    <div
      className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-border text-sm"
      role="alert"
    >
      <span className="text-muted-foreground">招聘指标加载失败</span>
      <Button onClick={onRetry} size="sm" variant="outline">
        重试
      </Button>
    </div>
  );
}

class MetricsErrorBoundary extends Component<
  { children: ReactNode; onReset: MetricsRetry },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  private readonly retry = async () => {
    await this.props.onReset();
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <MetricsLoadError onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

export function ResumeLibraryMetricsSection({
  chartKey,
  error,
  isSwitching = false,
  isRefreshing = false,
  metrics,
  onRefresh,
  onRetry,
  renderCharts,
}: {
  /** Forces chart remount when scope data changes (TanStack Charts is definition-identity driven). */
  chartKey?: string;
  error: unknown;
  isRefreshing?: boolean;
  isSwitching?: boolean;
  metrics: ResumeLibraryMetrics | undefined;
  onRefresh?: MetricsRetry;
  onRetry: MetricsRetry;
  renderCharts?: (metrics: ResumeLibraryMetrics) => ReactNode;
}) {
  if (error && !metrics) {
    return <MetricsLoadError onRetry={onRetry} />;
  }

  return (
    <MetricsErrorBoundary onReset={onRetry}>
      <SkeletonReveal loading={!metrics} skeleton={<ResumeLibraryMetricsSkeleton />}>
        {metrics ? (
          <div
            aria-busy={isSwitching || undefined}
            className={cn(
              "transition-opacity duration-200",
              isSwitching && "pointer-events-none opacity-50",
            )}
          >
            {renderCharts ? (
              <MetricsChartRenderer metrics={metrics} renderCharts={renderCharts} />
            ) : (
              <ResumeLibraryCharts
                chartKey={chartKey}
                isRefreshing={isRefreshing}
                metrics={metrics}
                onRefresh={onRefresh}
              />
            )}
          </div>
        ) : null}
      </SkeletonReveal>
    </MetricsErrorBoundary>
  );
}
