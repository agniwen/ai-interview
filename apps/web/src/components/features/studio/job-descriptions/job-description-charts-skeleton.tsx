import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function JobDescriptionChartSkeleton() {
  return (
    <Card
      className="gap-0 overflow-hidden rounded-xl py-0"
      data-slot="job-description-chart-skeleton"
    >
      <div className="grid border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <CardHeader className="min-w-0 gap-1 p-4 sm:p-5">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        {Array.from({ length: 2 }, (_, index) => (
          <div className="border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5" key={index}>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-1 h-7 w-16" />
          </div>
        ))}
      </div>
      <CardContent className="p-4">
        <Skeleton className="h-[220px] w-full" />
      </CardContent>
    </Card>
  );
}

export function JobDescriptionChartsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-slot="job-description-charts-skeleton">
      {Array.from({ length: 3 }, (_, index) => (
        <JobDescriptionChartSkeleton key={index} />
      ))}
    </div>
  );
}
