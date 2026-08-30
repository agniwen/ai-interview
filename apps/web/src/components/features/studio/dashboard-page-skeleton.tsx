import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton({
  children,
  titleWidth = "w-28",
}: {
  children: React.ReactNode;
  titleWidth?: string;
}) {
  return (
    <Card data-slot="dashboard-panel-skeleton">
      <CardHeader>
        <Skeleton className={`h-5 ${titleWidth}`} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ListRowsSkeleton({ count, height = "h-[68px]" }: { count: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div className={`rounded-lg border p-3 ${height}`} key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPanelsSkeleton() {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <PanelSkeleton titleWidth="w-20">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <ListRowsSkeleton count={5} />
            <Skeleton className="h-full min-h-52 rounded-lg" />
          </div>
        </PanelSkeleton>
        <PanelSkeleton titleWidth="w-20">
          <ListRowsSkeleton count={4} height="h-[74px]" />
        </PanelSkeleton>
      </div>

      <PanelSkeleton titleWidth="w-36">
        <Skeleton className="h-72 w-full" />
      </PanelSkeleton>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <PanelSkeleton titleWidth="w-32">
          <ListRowsSkeleton count={4} height="h-[86px]" />
        </PanelSkeleton>
        <div className="flex flex-col gap-4">
          <PanelSkeleton titleWidth="w-24">
            <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
              <Skeleton className="size-48 rounded-full" />
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton className="h-4 w-full" key={index} />
                ))}
              </div>
            </div>
          </PanelSkeleton>
          <PanelSkeleton titleWidth="w-36">
            <div className="grid gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton className="h-[70px] w-full rounded-lg" key={index} />
              ))}
            </div>
          </PanelSkeleton>
        </div>
      </div>
    </>
  );
}
