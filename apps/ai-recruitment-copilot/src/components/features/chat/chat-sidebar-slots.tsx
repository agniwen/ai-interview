"use client";

import { IconPlus, IconSquareCheck, IconTrash, IconX } from "@tabler/icons-react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useState } from "react";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteConversation, fetchConversations } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@arc/shared/utils";
import { CHAT_EVENTS, notifyConversationsChanged } from "./lib/chat-events";
import { isStudioResumeChatId } from "../studio/studio-resume-chat";

interface ConversationListItem {
  id: string;
  title: string;
  isTitleGenerating: boolean;
  updatedAt: string;
}

const GENERATING_CHAT_TITLE = "生成中...";
const SESSION_TIME_ZONE = "Asia/Shanghai";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

function formatSessionTimeAgo(value: string, now: number | null) {
  if (now === null) {
    return "";
  }

  const date = dayjs(value);
  if (!date.isValid()) {
    return "";
  }

  return date
    .tz(SESSION_TIME_ZONE)
    .locale("zh-cn")
    .from(dayjs(now).tz(SESSION_TIME_ZONE), true)
    .replaceAll("分钟", "分");
}

function useActiveSessionId() {
  return useParams({
    select: (params) => (typeof params.sessionId === "string" ? params.sessionId : null),
    strict: false,
  });
}

function ChatSidebarHeader({
  onNewConversation,
  editMode,
  onToggleEditMode,
  selectedCount,
  onBulkDelete,
  isBulkDeleting,
}: {
  onNewConversation: () => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  selectedCount: number;
  onBulkDelete: () => void;
  isBulkDeleting: boolean;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (isCollapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem className="select-none">
          <SidebarMenuButton
            className="h-9 justify-center  gap-2 text-sidebar-foreground/80"
            onClick={onNewConversation}
            size="default"
            tooltip="新建对话"
          >
            <IconPlus className="size-4" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (editMode) {
    return (
      <div className="flex items-center select-none gap-1.5 px-1">
        <Button
          className="h-9 flex-1 gap-2"
          disabled={selectedCount === 0 || isBulkDeleting}
          onClick={onBulkDelete}
          size="sm"
          variant="destructive"
        >
          <IconTrash className="size-4" />
          {isBulkDeleting ? "正在删除…" : `删除 (${selectedCount})`}
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="退出批量编辑"
                className="size-9 shrink-0"
                disabled={isBulkDeleting}
                onClick={onToggleEditMode}
                size="icon"
                variant="ghost"
              >
                <IconX className="size-4" />
              </Button>
            }
          />
          <TooltipContent>退出批量编辑</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 ">
      <Button
        className="h-9 flex-1 select-none justify-start gap-2 text-sidebar-foreground/80"
        onClick={onNewConversation}
        size="sm"
        variant="ghost"
      >
        <IconPlus className="size-4" />
        <span className="font-medium text-sm">新建对话</span>
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="批量编辑"
              className="size-9 shrink-0 text-sidebar-foreground/80"
              onClick={onToggleEditMode}
              size="icon"
              variant="ghost"
            >
              <IconSquareCheck className="size-4" />
            </Button>
          }
        />
        <TooltipContent>批量编辑</TooltipContent>
      </Tooltip>
    </div>
  );
}

function renderSessionItem({
  conversation,
  slug,
  editMode,
  isSelected,
  itemBody,
  closeOnNavigate,
  onToggleSelect,
  deleteTargetId,
  deletingConversationId,
  now,
  onConfirmDelete,
  onDeleteOpenChange,
}: {
  conversation: ConversationListItem;
  slug: string;
  editMode: boolean;
  isSelected: boolean;
  itemBody: React.ReactNode;
  closeOnNavigate: () => void;
  onToggleSelect: (id: string) => void;
  deleteTargetId: string | null;
  deletingConversationId: string | null;
  now: number | null;
  onConfirmDelete: (conversation: ConversationListItem) => void;
  onDeleteOpenChange: (conversation: ConversationListItem, open: boolean) => void;
}) {
  if (editMode) {
    return (
      <label className="flex min-w-0 flex-1 cursor-default items-center gap-2 rounded-md text-left">
        <Checkbox
          checked={isSelected}
          className="ml-2 shrink-0 cursor-default"
          onCheckedChange={() => onToggleSelect(conversation.id)}
        />
        {itemBody}
      </label>
    );
  }

  const timeAgo = formatSessionTimeAgo(conversation.updatedAt, now);
  const isDeletingThisConversation = deletingConversationId === conversation.id;
  const isDeletePopoverOpen = deleteTargetId === conversation.id;

  return (
    <>
      <Link
        // focus 指示器统一交给外层 wrapper（用 ring-inset 不裁切），Link 自己的
        // outline 关掉，避免在窄 padding 里溢出顶到 sidebar 容器被截。
        // Focus indicator lives on the wrapper (ring-inset, no clipping). Drop
        // the Link's own outline so it doesn't bleed into the sidebar edge.
        className="min-w-0 flex-1 cursor-default rounded-md focus-visible:outline-none"
        params={{ sessionId: conversation.id, slug }}
        to="/w/$slug/agent/$sessionId"
        onClick={closeOnNavigate}
      >
        {itemBody}
      </Link>

      <div className="relative flex h-7 w-12 shrink-0 items-center justify-end">
        <time
          className={cn(
            "absolute right-1 whitespace-nowrap text-muted-foreground/70 text-xs tabular-nums transition-opacity group-focus-within/session-item:opacity-0 group-hover/session-item:opacity-0",
            isDeletePopoverOpen && "opacity-0",
          )}
          dateTime={conversation.updatedAt}
        >
          {timeAgo}
        </time>
        <Popover
          onOpenChange={(open) => onDeleteOpenChange(conversation, open)}
          open={isDeletePopoverOpen}
        >
          <PopoverTrigger
            render={
              <Button
                aria-label="删除聊天记录"
                className="absolute right-0 size-7 cursor-default rounded-md opacity-0 transition-opacity group-focus-within/session-item:opacity-100 group-hover/session-item:opacity-100 hover:bg-destructive/12 hover:text-destructive focus-visible:opacity-100 data-popup-open:opacity-100"
                disabled={isDeletingThisConversation}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IconTrash className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-52 p-2.5" sideOffset={6}>
            <div className="flex flex-col gap-2.5">
              <div className="space-y-0.5">
                <p className="truncate font-medium text-sm">
                  删除「{conversation.title || "未命名对话"}」？
                </p>
                <p className="text-muted-foreground text-xs">删除后无法恢复。</p>
              </div>
              <div className="flex justify-end gap-1.5">
                <Button
                  className="h-7 px-2 text-xs"
                  disabled={isDeletingThisConversation}
                  onClick={() => onDeleteOpenChange(conversation, false)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  取消
                </Button>
                <Button
                  className="h-7 px-2 text-xs"
                  disabled={isDeletingThisConversation}
                  onClick={() => onConfirmDelete(conversation)}
                  size="xs"
                  type="button"
                  variant="destructive"
                >
                  {isDeletingThisConversation ? "删除中..." : "删除"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

function ChatSidebarBody({
  conversations,
  activeSessionId,
  slug,
  deleteTargetId,
  deletingConversationId,
  now,
  onConfirmDelete,
  onDeleteOpenChange,
  editMode,
  selectedIds,
  onToggleSelect,
}: {
  conversations: ConversationListItem[];
  activeSessionId: string | null;
  slug: string;
  deleteTargetId: string | null;
  deletingConversationId: string | null;
  now: number | null;
  onConfirmDelete: (conversation: ConversationListItem) => void;
  onDeleteOpenChange: (conversation: ConversationListItem, open: boolean) => void;
  editMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
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

            return (
              <li key={conversation.id}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        className={cn(
                          "block cursor-default rounded-md px-1.5 py-1.5 transition-colors",
                          isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                        )}
                        params={{ sessionId: conversation.id, slug }}
                        to="/w/$slug/agent/$sessionId"
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
                    }
                  />
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
    <ul className="space-y-0.5 px-1.5 py-1">
      {conversations.map((conversation) => {
        const isActive = activeSessionId === conversation.id;
        const isSelected = selectedIds.has(conversation.id);
        const visibleTitle = conversation.isTitleGenerating
          ? GENERATING_CHAT_TITLE
          : conversation.title;

        const itemBody = (
          <div className="min-w-0 select-none flex-1 rounded-md px-2 py-1 text-left">
            <p className="truncate font-medium text-[13px] leading-5">{visibleTitle}</p>
          </div>
        );

        return (
          <li key={conversation.id}>
            <div
              className={cn(
                "group/session-item flex cursor-default items-center gap-1 rounded-md border border-transparent px-1 py-0.5 transition-colors",
                isActive && !editMode
                  ? "border-sidebar-border/80 bg-sidebar-accent"
                  : "hover:bg-sidebar-accent/60",
                editMode && isSelected ? "border-sidebar-border/80 bg-sidebar-accent" : "",
              )}
            >
              {renderSessionItem({
                closeOnNavigate,
                conversation,
                deleteTargetId,
                deletingConversationId,
                editMode,
                isSelected,
                itemBody,
                now,
                onConfirmDelete,
                onDeleteOpenChange,
                onToggleSelect,
                slug,
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatSidebarSlots() {
  const navigate = useNavigate();
  const slug = useWorkspaceSlug();
  const chatRoot = `/w/${slug}/agent`;
  const { setOpenMobile, isMobile, state } = useSidebar();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const activeSessionId = useActiveSessionId();

  const refreshConversationList = useCallback(async () => {
    try {
      const rows = await fetchConversations(slug);
      setConversations(
        rows
          .filter((item) => !isStudioResumeChatId(item.id))
          .map((item) => ({
            id: item.id,
            isTitleGenerating: item.isTitleGenerating,
            title: item.title,
            updatedAt: item.updatedAt,
          })),
      );
    } catch {
      // network failure — keep the previous list; the next tick will retry
    }
  }, [slug]);

  const handleStartNewConversation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    window.dispatchEvent(new CustomEvent(CHAT_EVENTS.startNewConversation));
    void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
  }, [isMobile, navigate, setOpenMobile, slug]);

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

    window.addEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
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
      window.removeEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshConversationList]);

  useEffect(() => {
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const ids = [...selectedIds];
    setIsBulkDeleting(true);
    try {
      await Promise.allSettled(ids.map((id) => deleteConversation(slug, id)));
    } finally {
      setIsBulkDeleting(false);
    }

    setBulkConfirmOpen(false);
    setSelectedIds(new Set());
    setEditMode(false);
    notifyConversationsChanged();
    await refreshConversationList();

    if (activeSessionId && ids.includes(activeSessionId)) {
      void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
    }
  }, [activeSessionId, navigate, refreshConversationList, selectedIds, slug]);

  const handleDeleteOpenChange = useCallback(
    (conversation: ConversationListItem, open: boolean) => {
      setDeleteTargetId(open ? conversation.id : null);
    },
    [],
  );

  const confirmDelete = useCallback(
    async (conversation: ConversationListItem) => {
      const { id } = conversation;
      setDeletingConversationId(id);
      try {
        await deleteConversation(slug, id);
      } catch {
        // surface nothing — the UI will reflect server state on next refresh
      } finally {
        setDeletingConversationId(null);
      }
      setDeleteTargetId(null);
      notifyConversationsChanged();
      await refreshConversationList();

      if (activeSessionId === id) {
        void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
      }
    },
    [activeSessionId, navigate, refreshConversationList, slug],
  );

  return (
    <>
      <SidebarHeaderPortalContent>
        <ChatSidebarHeader
          editMode={editMode}
          isBulkDeleting={isBulkDeleting}
          onBulkDelete={() => setBulkConfirmOpen(true)}
          onNewConversation={handleStartNewConversation}
          onToggleEditMode={toggleEditMode}
          selectedCount={selectedIds.size}
        />
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <ChatSidebarBody
          activeSessionId={activeSessionId}
          conversations={conversations}
          deleteTargetId={deleteTargetId}
          deletingConversationId={deletingConversationId}
          editMode={editMode}
          now={now}
          onConfirmDelete={(conversation) => void confirmDelete(conversation)}
          onDeleteOpenChange={handleDeleteOpenChange}
          onToggleSelect={handleToggleSelect}
          selectedIds={selectedIds}
          slug={slug}
        />
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL={chatRoot}
          collapsed={state === "collapsed"}
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>

      <AlertDialog onOpenChange={setBulkConfirmOpen} open={bulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除 {selectedIds.size} 条聊天记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复。所选会话的全部消息也会一并移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleBulkDelete();
              }}
              variant="destructive"
            >
              {isBulkDeleting ? "正在删除…" : `删除 ${selectedIds.size} 条`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
