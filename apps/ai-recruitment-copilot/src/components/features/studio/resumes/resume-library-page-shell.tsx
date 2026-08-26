import { useQueryClient } from "@tanstack/react-query";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VISIBLE_PIPELINE_STAGES } from "./resume-library-page-model";
import type { ResumeLibraryGridState } from "./resume-library-page-model";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { PageHeader } from "@/components/features/studio/page-header";
import { ResumeLibraryMetricsSection } from "@/components/features/studio/resumes/resume-library-metrics-section";
import { studioResumeKeys } from "@/lib/client/api/query-keys";
import type { ResumeMetricsScope } from "@/lib/client/atoms/resume-metrics-scope";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function ResumeLibraryPageShell({
  children,
  grid,
  metrics,
  metricsChartKey,
  metricsError,
  metricsFetching,
  metricsScope,
  metricsSwitching,
  onMetricsRetry,
  onMetricsScopeChange,
  slug,
}: {
  children: ReactNode;
  grid: ResumeLibraryGridState;
  metrics: ResumeLibraryMetrics | undefined;
  metricsChartKey: string;
  metricsError: unknown;
  metricsFetching: boolean;
  metricsScope: ResumeMetricsScope;
  metricsSwitching: boolean;
  onMetricsRetry: () => Promise<void>;
  onMetricsScopeChange: (scope: ResumeMetricsScope) => void;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const handleMetricsRetry = async () => {
    await onMetricsRetry();
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader
        className="items-end sm:items-end"
        actionRender={
          <div className="flex items-center gap-1">
            <Button
              className="opacity-80 hover:opacity-100"
              disabled={metricsFetching}
              onClick={() => {
                const next = metricsScope === "team" ? "personal" : "team";
                // Clear target-scope cache so switch always hits the network and charts remount.
                void queryClient.removeQueries({
                  queryKey: studioResumeKeys.metrics(slug, next),
                });
                onMetricsScopeChange(next);
              }}
              suppressHydrationWarning
              type="button"
              size="xs"
              variant="ghost"
            >
              {metricsScope === "team" ? "切换个人维度" : "切换到团队维度"}
            </Button>
          </div>
        }
        title="招聘台"
      />
      <ResumeLibraryMetricsSection
        chartKey={metricsChartKey}
        error={metricsError}
        isRefreshing={metricsFetching}
        isSwitching={metricsSwitching}
        metrics={metrics}
        onRefresh={handleMetricsRetry}
        onRetry={onMetricsRetry}
      />
      <Tabs
        onValueChange={(value) => grid.setFilter("stage", value === "all" ? "" : value)}
        value={grid.filters.stage || "all"}
      >
        <TabsList
          aria-label="招聘阶段"
          className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-nowrap"
        >
          <TabsTrigger className="h-10! w-full px-3 sm:w-auto sm:px-8" value="all">
            全部
          </TabsTrigger>
          {VISIBLE_PIPELINE_STAGES.map((stage) => (
            <TabsTrigger className="h-10! w-full px-3 sm:w-auto sm:px-8" key={stage} value={stage}>
              {pipelineStageMeta[stage].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
