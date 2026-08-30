import { Card, CardPanel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ResumePoolCardSkeleton() {
  return (
    <div
      className="h-[356px] pb-3 sm:h-[308px] md:h-[286px] lg:h-[246px] xl:h-[220px] 2xl:h-[218px]"
      data-slot="resume-pool-card-skeleton"
    >
      <Card className="h-full overflow-hidden rounded-xl">
        <CardPanel className="grid h-full min-h-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4">
          <div className="flex min-h-0 min-w-0 gap-3">
            <Skeleton
              className="mt-0.5 size-12 shrink-0 rounded-full"
              data-slot="resume-pool-card-skeleton-avatar"
            />

            <div className="min-h-0 min-w-0 flex-1">
              <div className="grid min-w-0 gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)]">
                <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                  <Skeleton className="h-5 w-36 max-w-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>

                <div className="min-h-0 min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Skeleton className="h-4 w-32" data-slot="resume-pool-card-skeleton-meta" />
                    <Skeleton className="h-4 w-36" data-slot="resume-pool-card-skeleton-meta" />
                    <Skeleton className="h-4 w-40" data-slot="resume-pool-card-skeleton-meta" />
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <Skeleton
                      className="h-[19px] w-full"
                      data-slot="resume-pool-card-skeleton-summary"
                    />
                    <Skeleton
                      className="h-[19px] w-4/5"
                      data-slot="resume-pool-card-skeleton-summary"
                    />
                  </div>

                  <div className="mt-3 flex gap-1.5 overflow-hidden">
                    <Skeleton
                      className="h-6 w-20 shrink-0 rounded-full"
                      data-slot="resume-pool-card-skeleton-skill"
                    />
                    <Skeleton
                      className="h-6 w-24 shrink-0 rounded-full"
                      data-slot="resume-pool-card-skeleton-skill"
                    />
                    <Skeleton
                      className="h-6 w-16 shrink-0 rounded-full"
                      data-slot="resume-pool-card-skeleton-skill"
                    />
                  </div>
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
          </div>

          <div className="flex items-center justify-end gap-1.5 lg:flex-col lg:items-stretch">
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
