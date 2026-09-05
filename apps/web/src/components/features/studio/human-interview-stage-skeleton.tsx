import { Frame, FrameHeader, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";

export function HumanInterviewStageSkeleton() {
  return (
    <output aria-label="加载真人复面" aria-busy="true" className="block">
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex h-5 items-center gap-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="size-3 rounded-sm" />
        </div>
        {["first", "second"].map((key) => (
          <Frame key={key}>
            <FrameHeader className="h-auto min-h-10 flex-wrap justify-between gap-3 py-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-20" />
            </FrameHeader>
            <FramePanel className="flex flex-col gap-4">
              <div className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-7" />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-6" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t border-border/40 pt-4">
                <div className="flex h-5 items-center gap-2">
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="mb-1 h-3 w-12" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-[92%]" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
                <div className="flex h-8 items-center justify-center">
                  <Skeleton className="h-3.5 w-36" />
                </div>
              </div>
            </FramePanel>
          </Frame>
        ))}
      </div>
    </output>
  );
}
