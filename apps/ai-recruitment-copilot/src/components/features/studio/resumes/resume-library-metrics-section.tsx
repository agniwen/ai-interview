"use client";

import { QueryErrorResetBoundary, useSuspenseQuery } from "@tanstack/react-query";
import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchStudioResumeMetrics } from "@/lib/client/api/endpoints/studio-resumes";
import { studioResumeKeys } from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { ResumeLibraryCharts } from "./resume-library-charts";

class MetricsErrorBoundary extends Component<
  {
    children: ReactNode;
    onReset: () => void;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  private readonly retry = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-border text-sm"
          role="alert"
        >
          <span className="text-muted-foreground">招聘指标加载失败</span>
          <Button onClick={this.retry} size="sm" variant="outline">
            重试
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MetricsSkeleton() {
  return (
    <output aria-label="招聘指标加载中" className="block">
      <Skeleton className="h-48 w-full" />
    </output>
  );
}

function ResumeLibraryMetricsContent({ slug }: { slug: string }) {
  const { data: metrics } = useSuspenseQuery({
    queryFn: () => fetchStudioResumeMetrics(slug),
    queryKey: studioResumeKeys.metrics(slug),
  });

  return <ResumeLibraryCharts metrics={metrics} />;
}

function ResumeLibraryMetricsClient() {
  const slug = useWorkspaceSlug();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <MetricsErrorBoundary key={slug} onReset={reset}>
          <Suspense fallback={<MetricsSkeleton />}>
            <ResumeLibraryMetricsContent slug={slug} />
          </Suspense>
        </MetricsErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function ResumeLibraryMetricsSection() {
  return (
    <ClientOnly fallback={<MetricsSkeleton />}>
      <ResumeLibraryMetricsClient />
    </ClientOnly>
  );
}
