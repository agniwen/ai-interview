"use client";

import { useAtomValue } from "jotai";
import { PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/app-sidebar/portals";
import { SidebarUserSection } from "@/components/sidebar-user-section";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteConversation, fetchConversations } from "@/lib/chat-api";
import { cn } from "@/lib/utils";
import { tutorialStepAtom } from "../_atoms/tutorial";
import { TUTORIAL_MOCK_CONVERSATIONS } from "../constants/tutorial-mock";

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number;
  isTitleGenerating: boolean;
}

const GENERATING_CHAT_TITLE = "生成中...";

function useActiveSessionId() {
  const pathname = usePathname();
  const params = useParams<{ sessionId?: string | string[] }>();

  const currentPathname = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => {
      window.addEventListener("popstate", onStoreChange);
      window.addEventListener("chat:session-path-updated", onStoreChange);

      return () => {
        window.removeEventListener("popstate", onStoreChange);
        window.removeEventListener("chat:session-path-updated", onStoreChange);
      };
    }, []),
    () => window.location.pathname,
    () => pathname,
  );

  return useMemo(() => {
    const routeSessionId = params.sessionId;

    if (typeof routeSessionId === "string" && routeSessionId.trim()) {
      return routeSessionId;
    }

    if (Array.isArray(routeSessionId) && routeSessionId[0]?.trim()) {
      return routeSessionId[0];
    }

    if (!currentPathname.startsWith("/chat/")) {
      return null;
    }

    const [id] = currentPathname.slice("/chat/".length).split("/");

    return id ? decodeURIComponent(id) : null;
  }, [currentPathname, params.sessionId]);
}

function ChatSidebarHeader({ onNewConversation }: { onNewConversation: () => void }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className={cn(
            "h-9 gap-2 text-sidebar-foreground/80",
            isCollapsed ? "justify-center" : "",
          )}
          onClick={onNewConversation}
          size="default"
          tooltip="新建对话"
        >
          <PlusIcon className="size-4" />
          {isCollapsed ? null : <span className="font-medium text-sm">新建对话</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ChatSidebarBody({
  conversations,
  activeSessionId,
  onDelete,
}: {
  conversations: ConversationListItem[];
  activeSessionId: string | null;
  onDelete: (conversation: ConversationListItem) => void;
}) {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  const closeOnNavigate = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  if (conversations.length === 0) {
    if (isCollapsed) {
      return null;
    }

    return <p className="px-3 py-3 text-muted-foreground text-xs">暂无聊天记录</p>;
  }

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <ul className="space-y-1.5 px-1">
          {conversations.map((conversation) => {
            const isActive = activeSessionId === conversation.id;
            const visibleTitle = conversation.isTitleGenerating
              ? GENERATING_CHAT_TITLE
              : conversation.title;
            const isMock = conversation.id.startsWith("tutorial-");

            return (
              <li key={conversation.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {isMock ? (
                      <div
                        aria-disabled="true"
                        className={cn(
                          "block rounded-md px-1.5 py-1.5",
                          isActive ? "bg-sidebar-accent" : "",
                        )}
                      >
                        <div
                          className={cn(
                            "h-1.5 rounded-full",
                            isActive
                              ? "bg-sidebar-foreground/40 w-full"
                              : "bg-muted-foreground/20 w-3/4",
                          )}
                        />
                      </div>
                    ) : (
                      <Link
                        className={cn(
                          "block rounded-md px-1.5 py-1.5 transition-colors",
                          isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                        )}
                        href={`/chat/${conversation.id}`}
                        onClick={closeOnNavigate}
                      >
                        <div
                          className={cn(
                            "h-1.5 rounded-full",
                            isActive
                              ? "bg-sidebar-foreground/40 w-full"
                              : "bg-muted-foreground/20 w-3/4",
                          )}
                        />
                      </Link>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right">{visibleTitle}</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </TooltipProvider>
    );
  }

  return (
    <ul className="space-y-1 px-1.5 py-1">
      {conversations.map((conversation) => {
        const isMock = conversation.id.startsWith("tutorial-");
        const isActive = activeSessionId === conversation.id;
        const visibleTitle = conversation.isTitleGenerating
          ? GENERATING_CHAT_TITLE
          : conversation.title;

        return (
          <li key={conversation.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded-lg border border-transparent px-1 py-1 transition-colors",
                isActive ? "border-sidebar-border bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
              )}
            >
              {isMock ? (
                <div className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left">
                  <p className="truncate font-medium text-sm">{visibleTitle}</p>
                  <p className="mt-1 truncate text-muted-foreground text-xs">
                    <TimeDisplay
                      as="span"
                      options={DATE_TIME_DISPLAY_OPTIONS}
                      value={conversation.updatedAt}
                    />
                  </p>
                </div>
              ) : (
                <>
                  <Link
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left"
                    href={`/chat/${conversation.id}`}
                    onClick={closeOnNavigate}
                  >
                    <p className="truncate font-medium text-sm">{visibleTitle}</p>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      <TimeDisplay
                        as="span"
                        options={DATE_TIME_DISPLAY_OPTIONS}
                        value={conversation.updatedAt}
                      />
                    </p>
                  </Link>

                  <Button
                    aria-label="删除聊天记录"
                    className="size-7 rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/12 hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(conversation);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatSidebarSlots() {
  const router = useRouter();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ConversationListItem | null>(null);
  const activeSessionId = useActiveSessionId();

  const displayConversations =
    tutorialStep !== null && conversations.length === 0
      ? TUTORIAL_MOCK_CONVERSATIONS
      : conversations;

  const refreshConversationList = useCallback(async () => {
    try {
      const rows = await fetchConversations();
      setConversations(
        rows.map((item) => ({
          id: item.id,
          isTitleGenerating: item.isTitleGenerating,
          title: item.title,
          updatedAt: item.updatedAt,
        })),
      );
    } catch {
      // network failure — keep the previous list; the next tick will retry
    }
  }, []);

  const handleStartNewConversation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    window.dispatchEvent(new CustomEvent("chat:start-new-conversation"));
    router.replace("/chat");
  }, [isMobile, router, setOpenMobile]);

  useEffect(() => {
    const initialTimerId = window.setTimeout(() => {
      void refreshConversationList();
    }, 0);

    // Event-driven refresh: the chat page dispatches this after any write
    // that affects the list (create, title update, assistant finished, delete).
    const handleListChanged = () => {
      void refreshConversationList();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshConversationList();
      }
    };

    window.addEventListener("chat:conversations-changed", handleListChanged);
    document.addEventListener("visibilitychange", handleVisibility);

    // Slow fallback in case an event was missed (e.g. external updates).
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void refreshConversationList();
      }
    }, 30_000);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
      window.removeEventListener("chat:conversations-changed", handleListChanged);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshConversationList]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteConversation(id);
    } catch {
      // surface nothing — the UI will reflect server state on next refresh
    }
    window.dispatchEvent(new CustomEvent("chat:conversations-changed"));
    await refreshConversationList();

    if (activeSessionId === id) {
      router.replace("/chat");
    }
  }, [activeSessionId, deleteTarget, refreshConversationList, router]);

  return (
    <>
      <SidebarHeaderPortalContent>
        <ChatSidebarHeader onNewConversation={handleStartNewConversation} />
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <ChatSidebarBody
          activeSessionId={activeSessionId}
          conversations={displayConversations}
          onDelete={setDeleteTarget}
        />
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL="/chat"
          collapsed={state === "collapsed"}
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条聊天记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复。当前记录：
              {deleteTarget?.title ?? "未知对话"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
