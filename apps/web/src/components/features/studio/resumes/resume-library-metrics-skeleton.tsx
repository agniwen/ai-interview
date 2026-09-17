import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function MetricsCardBodySkeleton({ compact, index }: { compact: boolean; index: number }) {
  const bodyHeightClass = compact ? "min-h-[176px]" : "min-h-[228px]";

  if (index === 1) {
    return (
      <div className={`flex flex-col gap-4 ${bodyHeightClass}`}>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-48 max-w-[75%]" />
          <Skeleton className="h-7 w-16" />
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, rowIndex) => (
            <div
              className="grid grid-cols-[1rem_1.5rem_minmax(0,1fr)_3.25rem] items-center gap-2"
              key={rowIndex}
            >
              <Skeleton className="h-3 w-3" />
              <Skeleton className="size-6 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-1.5 w-full" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div
        className={`grid grid-cols-[minmax(7.5rem,9rem)_9rem] items-center justify-center gap-3 ${bodyHeightClass}`}
      >
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="size-36 rounded-full" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col justify-center gap-4 ${bodyHeightClass}`}>
      <Skeleton className="h-[86px] w-full" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {Array.from({ length: 6 }, (_, rowIndex) => (
          <div className="flex items-center gap-2" key={rowIndex}>
            <Skeleton className="size-2.5 rounded-sm" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsCardSkeleton({ compact, index }: { compact: boolean; index: number }) {
  return (
    <Card
      className="h-full gap-0 overflow-hidden rounded-xl py-0"
      data-slot="metrics-card-skeleton"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(2,5rem)] border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,6rem)] 2xl:h-22">
        <CardHeader className="min-w-0 gap-1 p-3 sm:p-4 2xl:p-5">
          <Skeleton className="h-6 w-28 max-w-full" />
          <Skeleton className="h-5 w-36 max-w-full" />
        </CardHeader>
        {Array.from({ length: 2 }, (_, metricIndex) => (
          <div
            className="flex min-w-0 flex-col justify-center border-l px-2 py-3 sm:px-3"
            key={metricIndex}
          >
            <Skeleton className="h-3 w-12 max-w-full" />
            <Skeleton className="mt-1 h-6 w-12 max-w-full" />
          </div>
        ))}
      </div>
      <CardContent className="p-0">
        <div
          className={`${compact ? "h-[208px]" : "h-[260px]"} overflow-hidden p-4`}
          data-slot="metrics-card-body-skeleton"
        >
          <MetricsCardBodySkeleton compact={compact} index={index} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ResumeLibraryMetricsSkeleton({ compact = false }: { compact?: boolean }) {
  const cardIndexes = compact ? [0, 2] : [0, 1, 2];
  return (
    <output aria-label="招聘指标加载中" className="block">
      <div className={`grid gap-4 ${compact ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {cardIndexes.map((index) => (
          <MetricsCardSkeleton compact={compact} index={index} key={index} />
        ))}
      </div>
    </output>
  );
}
