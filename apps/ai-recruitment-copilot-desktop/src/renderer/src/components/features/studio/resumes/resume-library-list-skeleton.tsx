import {
  STUDIO_DATE_GROUP_ROW_HEIGHT,
  StudioDateGroupHeaderSkeleton,
} from "../studio-date-group-virtual-list";
import { Skeleton } from "@/components/ui/skeleton";

function ResumeLibraryCardSkeleton({ rowHeight }: { rowHeight: number }) {
  return (
    <div
      className="pb-3"
      data-slot="resume-library-card-skeleton-row"
      style={{ height: rowHeight }}
    >
      <article className="relative flex h-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex w-full gap-3 p-4">
          <Skeleton className="mt-0.5 size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="grid min-w-0 gap-x-4 gap-y-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] xl:gap-x-8">
              <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                <Skeleton className="h-5 w-44 max-w-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="mt-2 space-y-1">
                  <Skeleton className="h-[19px] w-full" />
                  <Skeleton className="h-[19px] w-5/6" />
                  <Skeleton className="h-[19px] w-2/3" />
                </div>
                <div className="mt-3 flex h-6 gap-1.5 overflow-hidden">
                  <Skeleton className="h-6 w-20 shrink-0" />
                  <Skeleton className="h-6 w-24 shrink-0" />
                  <Skeleton className="h-6 w-16 shrink-0" />
                </div>
              </div>
              <div className="hidden min-w-0 border-border/60 border-l border-dashed pl-8 xl:block">
                <div className="grid min-w-0 content-start gap-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

export function ResumeLibraryListSkeleton({ cardHeight }: { cardHeight: number }) {
  return (
    <div data-slot="resume-library-list-skeleton">
      <div style={{ height: STUDIO_DATE_GROUP_ROW_HEIGHT }}>
        <StudioDateGroupHeaderSkeleton />
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <ResumeLibraryCardSkeleton key={index} rowHeight={cardHeight} />
      ))}
    </div>
  );
}
