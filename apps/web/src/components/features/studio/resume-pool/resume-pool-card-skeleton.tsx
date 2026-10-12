import { StudioListCardEvaluationSkeletonLines } from "@/components/features/studio/studio-list-card-evaluation";
import { Card, CardPanel } from "@/components/ui/card";
import { cn } from "@app/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { STUDIO_RECORD_ROW_DIVIDER_CLASS } from "@/components/features/studio/studio-date-group-virtual-list";

export function ResumePoolCardSkeleton() {
  return (
    <div
      className={cn(
        "relative h-[508px] py-1.5 sm:h-[464px] md:h-[464px] lg:h-[354px] xl:h-[354px] 2xl:h-[354px]",
        STUDIO_RECORD_ROW_DIVIDER_CLASS,
      )}
      data-slot="resume-pool-card-skeleton"
    >
      <Card className="h-full overflow-hidden rounded-lg border-0 bg-transparent">
        <CardPanel className="grid h-full min-h-0 content-center-safe gap-3 p-4">
          <div className="min-h-0 min-w-0">
            <div className="grid min-w-0 gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)]">
              <div className="flex min-w-0 items-center gap-3 xl:col-span-2">
                <Skeleton
                  className="size-10 shrink-0 rounded-full"
                  data-slot="resume-pool-card-skeleton-avatar"
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-36 max-w-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>

              <div className="min-h-0 min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                  <Skeleton className="h-4 w-32" data-slot="resume-pool-card-skeleton-meta" />
                  <Skeleton className="h-4 w-36" data-slot="resume-pool-card-skeleton-meta" />
                  <Skeleton className="h-4 w-40" data-slot="resume-pool-card-skeleton-meta" />
                </div>

                <StudioListCardEvaluationSkeletonLines />
              </div>

              <div className="hidden min-w-0 space-y-2 border-border/60 border-l border-dashed pl-8 xl:block">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-px w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 lg:hidden">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                className="h-8 w-16"
                data-slot="resume-pool-card-skeleton-action"
                key={index}
              />
            ))}
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
