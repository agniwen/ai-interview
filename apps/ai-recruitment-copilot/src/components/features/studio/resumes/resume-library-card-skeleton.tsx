import { Card, CardPanel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@arc/shared/utils";
import { RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS } from "./resume-library-card-layout";

export function ResumeLibraryCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS, className)}
      data-slot="resume-library-card-skeleton-row"
    >
      <Card className="h-full overflow-hidden rounded-xl" data-slot="resume-library-card-skeleton">
        <CardPanel className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="flex min-w-0 gap-3">
            <Skeleton className="mt-3 size-4 shrink-0" />
            <Skeleton className="mt-0.5 size-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="grid min-w-0 gap-x-4 gap-y-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] xl:gap-x-8">
                <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                  <Skeleton className="h-5 w-36 max-w-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Skeleton className="h-6 w-full xl:w-36" />
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Skeleton className="h-[19px] w-full" />
                    <Skeleton className="h-[19px] w-4/5" />
                    <Skeleton className="h-[19px] w-2/3" />
                  </div>
                  <div className="mt-3 flex gap-1.5 overflow-hidden">
                    <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
                    <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
                    <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                  </div>
                </div>
                <div className="hidden min-w-0 space-y-2 border-border/60 border-l border-dashed pl-8 xl:block">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton className={index === 2 ? "h-px w-full" : "h-4 w-full"} key={index} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end self-center">
            <div className="flex items-center justify-end gap-1.5 xl:flex-col xl:items-stretch">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton className="h-8 w-16" key={index} />
              ))}
            </div>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
