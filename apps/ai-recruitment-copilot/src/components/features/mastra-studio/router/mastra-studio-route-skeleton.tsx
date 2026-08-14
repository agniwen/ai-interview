import { Skeleton } from "@/components/ui/skeleton";

export function MastraStudioRouteSkeleton() {
  return (
    <output
      aria-label="正在加载 Mastra Studio"
      className="flex h-full min-h-[32rem] w-full flex-col gap-3 bg-background p-2"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 px-3">
        <Skeleton className="h-5 w-56 max-w-1/3" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="min-h-0 flex-1 rounded-2xl" />
    </output>
  );
}
