import { IconRefresh } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/features/studio/page-header";
import { ResumeLibraryMetricsSection } from "@/components/features/studio/resumes/resume-library-metrics-section";
import { studioResumeKeys } from "@/lib/client/api/query-keys";
import type { ResumeMetricsScope } from "@/lib/client/atoms/resume-metrics-scope";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  PIPELINE_STAGE_TAB_DESCRIPTIONS,
  VISIBLE_PIPELINE_STAGES,
} from "./resume-library-page-model";
import type { ResumeLibraryGridState } from "./resume-library-page-model";

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
            <Button
              aria-label="刷新招聘指标"
              className="opacity-80 hover:opacity-100"
              disabled={metricsFetching}
              onClick={handleMetricsRetry}
              size="icon-xs"
              title="刷新招聘指标"
              type="button"
              variant="ghost"
            >
              <IconRefresh className={metricsFetching ? "size-3 animate-spin" : "size-3"} />
            </Button>
          </div>
        }
        description="已经进入招聘流程的候选人在这里跟进：看简历、匹配岗位、推进到面试。"
        title="招聘台"
      />
      <ResumeLibraryMetricsSection
        chartKey={metricsChartKey}
        error={metricsError}
        isSwitching={metricsSwitching}
        metrics={metrics}
        onRetry={onMetricsRetry}
      />
      <Tabs
        onValueChange={(value) => {
          grid.setRowSelection({});
          grid.setFilter("stage", value === "all" ? "" : value);
        }}
        value={grid.filters.stage || "all"}
      >
        <TabsList className="grid w-full  grid-cols-2 h-auto items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
          <TabsTrigger
            className=" w-full flex-col items-start gap-0.5 px-3  sm:w-auto sm:px-8 py-1.5 h-12!"
            value="all"
          >
            <span className="text-sm leading-tight">全部</span>
            <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
              {PIPELINE_STAGE_TAB_DESCRIPTIONS.all}
            </span>
          </TabsTrigger>
          {VISIBLE_PIPELINE_STAGES.map((s) => (
            <TabsTrigger
              className=" w-full flex-col items-start gap-0.5 px-3 sm:w-auto sm:px-8 py-1.5 h-12!"
              key={s}
              value={s}
            >
              <span className="text-sm leading-tight">{pipelineStageMeta[s].label}</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {PIPELINE_STAGE_TAB_DESCRIPTIONS[s]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
