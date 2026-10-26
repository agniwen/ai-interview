import { DataGridContentSkeleton } from "@/components/features/data-grid";
import { StudioSummaryCardsSkeleton } from "@/components/features/studio/studio-summary-cards";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecruitingWorkspaceView } from "./recruiting-workspace-view";

const labels = {
  dashboard: "数据看板",
  hr: "HR 统计",
  jobs: "岗位汇总",
  records: "候选人明细",
};

export function RecruitingWorkspaceContentSkeleton({ view }: { view: RecruitingWorkspaceView }) {
  return (
    <output
      aria-busy="true"
      aria-label={`${labels[view]}加载中`}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-8 w-32" />
      </div>
      {view === "dashboard" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-36 rounded-xl" key={index} />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </>
      ) : null}
      {view === "jobs" ? (
        <>
          <StudioSummaryCardsSkeleton compact />
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-64 rounded-xl" key={index} />
            ))}
          </div>
        </>
      ) : null}
      {view === "hr" || view === "records" ? (
        <>
          <DataGridContentSkeleton columnCount={view === "hr" ? 5 : 12} rowCount={8} />
          {view === "hr" ? <DataGridContentSkeleton columnCount={9} rowCount={3} /> : null}
        </>
      ) : null}
    </output>
  );
}
