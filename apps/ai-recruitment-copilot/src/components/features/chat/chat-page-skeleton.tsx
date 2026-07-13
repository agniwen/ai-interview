import { emptyThreadStyle } from "@/components/assistant-ui/recruiting-thread-layout";
import { Skeleton } from "@/components/ui/skeleton";

export function ChatPageSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="招聘对话加载中"
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={emptyThreadStyle}
    >
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col justify-center px-4 pb-[18vh]">
        <div className="mb-6 flex justify-center">
          <Skeleton className="h-8 w-64 max-w-[72%]" />
        </div>
        <div className="flex w-full items-end gap-2 rounded-[28px] border border-input bg-background px-3 py-2 shadow-sm">
          <div className="flex min-h-9 flex-1 items-center px-2 py-2">
            <Skeleton className="h-4 w-40 max-w-[58%]" />
          </div>
          <Skeleton className="size-9 shrink-0 rounded-full" />
        </div>
        <div className="mt-2 flex justify-center">
          <Skeleton className="h-3 w-80 max-w-[82%]" />
        </div>
      </div>
    </output>
  );
}
