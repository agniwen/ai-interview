import { useMatchRoute } from "@tanstack/react-router";
import { IconArrowUp } from "@tabler/icons-react";
import {
  composerSendButtonClass,
  recruitingComposerDisclaimer,
  recruitingComposerPlaceholder,
} from "@/components/assistant-ui/recruiting-composer-style";
import { emptyThreadStyle } from "@/components/assistant-ui/recruiting-thread-layout";
import { Button } from "@/components/ui/button";
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
        <div className="flex w-full items-end gap-2 rounded-[28px] border border-input bg-background px-3 py-2">
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
            <div className="aui-composer-shell relative flex w-full flex-col gap-2 rounded-[28px] border border-input bg-background px-3 py-2 transition-colors focus-within:border-foreground/20">
              <div
                aria-hidden="true"
                className="aui-composer-input relative max-h-32 min-h-10 w-full bg-transparent px-2 py-2 text-base text-foreground"
              >
                <span className="text-muted-foreground">{recruitingComposerPlaceholder}</span>
              </div>
              <div className="aui-composer-action-wrapper flex items-center justify-end gap-1">
                <Button
                  aria-label="发送"
                  className={composerSendButtonClass}
                  disabled
                  size="icon"
                  type="button"
                >
                  <IconArrowUp className="size-4" />
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-muted-foreground text-xs">
            {recruitingComposerDisclaimer}
          </p>
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
