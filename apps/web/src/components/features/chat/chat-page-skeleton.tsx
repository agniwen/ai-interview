import { emptyThreadStyle } from "@/components/assistant-ui/recruiting-thread-layout";
import { Skeleton } from "@/components/ui/skeleton";

export function ChatPageSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="招聘对话加载中"
      className="flex min-h-0 flex-1 flex-col bg-background pt-(--header-height) text-foreground"
      style={emptyThreadStyle}
    >
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col justify-center px-4 pb-[18vh]">
        <div className="mb-6 flex flex-col items-center gap-4">
          <Skeleton className="size-[120px] rounded-full" />
          <Skeleton className="h-8 w-64 max-w-[72%]" />
        </div>
        <div className="mx-auto flex w-full max-w-xl items-center gap-1 rounded-[14px] border border-transparent bg-control p-1.5 shadow-default">
          <Skeleton className="mx-1.5 h-3.5 w-40 max-w-[58%]" />
          <Skeleton className="ml-auto size-7 shrink-0 rounded-lg" />
        </div>
        <div className="mx-auto mt-2 flex w-full max-w-xl justify-center">
          <Skeleton className="h-3 w-80 max-w-[82%]" />
        </div>
      </div>
    </output>
  );
}

export function ChatMessageSkeletonContent() {
  return (
    <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-6 px-4 pt-6 pb-8">
      <div className="flex justify-end">
        <div className="flex w-3/5 flex-col items-end gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="flex w-4/5 flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="flex justify-end">
        <div className="flex w-2/5 flex-col items-end gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="flex w-3/4 flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

export function ChatConversationThreadSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="聊天界面加载中"
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={emptyThreadStyle}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pt-(--header-height)">
        <ChatMessageSkeletonContent />
      </div>
      <div className="sticky bottom-0 z-30 bg-background px-4 pb-3">
        <div className="mx-auto w-full max-w-(--thread-max-width)">
          <div className="flex w-full items-center gap-1 rounded-[14px] border border-transparent bg-control p-1.5 shadow-default">
            <Skeleton className="mx-1.5 h-3.5 w-40 max-w-[58%]" />
            <Skeleton className="ml-auto size-7 shrink-0 rounded-lg" />
          </div>
          <div className="mt-2 flex justify-center">
            <Skeleton className="h-3 w-80 max-w-[82%]" />
          </div>
        </div>
      </div>
    </output>
  );
}
