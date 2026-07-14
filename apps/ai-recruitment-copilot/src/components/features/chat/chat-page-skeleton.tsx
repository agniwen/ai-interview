import { useMatchRoute } from "@tanstack/react-router";
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

export function ChatMessageListSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="聊天记录加载中"
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={emptyThreadStyle}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
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
      </div>
      <div className="aui-thread-footer sticky bottom-0 bg-background px-4 pb-3">
        <div className="mx-auto w-full max-w-(--thread-max-width)">
          <div className="aui-composer-root relative flex w-full flex-col">
            <div className="aui-composer-shell flex w-full flex-col gap-2 rounded-[28px] border border-input bg-background px-3 py-2 shadow-sm transition-shadow">
              <div className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-base text-foreground outline-none">
                <Skeleton className="h-4 w-40 max-w-[58%]" />
              </div>
              <div className="aui-composer-action-wrapper flex items-center justify-end gap-1">
                <Skeleton className="size-9 rounded-full" />
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-center">
            <Skeleton className="h-4 w-80 max-w-[82%]" />
          </div>
        </div>
      </div>
    </output>
  );
}

export function ChatPendingSkeleton() {
  const matchRoute = useMatchRoute();
  const pendingSessionRoute = matchRoute({
    pending: true,
    to: "/w/$slug/agent/$sessionId",
  });
  const pendingNewChatRoute = matchRoute({ pending: true, to: "/w/$slug/agent" });

  if (pendingSessionRoute) {
    return <ChatMessageListSkeleton />;
  }
  if (pendingNewChatRoute) {
    return <ChatPageSkeleton />;
  }

  const isSessionRoute = Boolean(matchRoute({ to: "/w/$slug/agent/$sessionId" }));

  return isSessionRoute ? <ChatMessageListSkeleton /> : <ChatPageSkeleton />;
}
