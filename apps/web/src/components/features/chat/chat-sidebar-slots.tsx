"use client";

import { IconPlus, IconSquareCheck, IconTrash, IconX } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useState } from "react";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { useSidebarMenuHoverHighlight } from "@/components/layout/app-sidebar/sidebar-menu-hover-highlight";
import { SidebarSlotTransition } from "@/components/layout/app-sidebar/sidebar-slot-transition";
import type { SidebarSlotDirection } from "@/components/layout/app-sidebar/sidebar-slot-transition";
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
import { runAsyncAction, withCleanup } from "@/lib/client/async-control";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteConversation, fetchConversations } from "@/lib/client/api";
import { chatConversationKeys } from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@app/shared/utils";
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
    select: (params) => params.sessionId ?? null,
    strict: false,
  });
}

export function ChatSidebarHeader({
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
  const { isMobile, state } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";
  const isEditing = editMode && !isCollapsed;

  // 批量编辑只替换「聊天记录」这一行（同为 h-8），「创建对话」保留并禁用，避免整列上下跳动。
  // Bulk edit swaps only the h-8 history row; New chat stays in place, disabled, so nothing shifts.
  return (
    <div className="flex flex-col gap-3 group-data-[collapsible=icon]:gap-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled={isEditing} onClick={onNewConversation} tooltip="创建对话">
            <IconPlus />
            <span>创建对话</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div
        className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-180 group-data-[collapsible=icon]:grid-rows-[0fr] group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none"
        inert={isCollapsed}
      >
        <div className="min-h-0 overflow-hidden">
          {isEditing ? (
            <div className="flex h-8 items-center gap-1.5 select-none">
              <Button
                className="h-8 flex-1 gap-2"
                disabled={selectedCount === 0 || isBulkDeleting}
                onClick={onBulkDelete}
                size="sm"
                variant="destructive-subtle"
              >
                <IconTrash className="size-4" />
                {isBulkDeleting ? "正在删除…" : `删除 (${selectedCount})`}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="退出批量编辑"
                      className="size-8 shrink-0"
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
          ) : (
            <div className="flex h-8 items-center justify-between pl-2">
              <h2 className="text-xs font-medium text-muted-foreground">聊天记录</h2>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="批量编辑"
                      className="size-8 shrink-0 text-sidebar-foreground/80"
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
          )}
        </div>
      </div>
    </div>
  );
}

function renderSessionItem({
  conversation,
  slug,
  editMode,
  isSelected,
  isActive,
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
  isActive: boolean;
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
      <label className="flex min-w-0 flex-1 cursor-default items-center gap-2 rounded-lg text-left">
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              // focus 指示器统一交给外层 wrapper（用 ring-inset 不裁切），Link 自己的
              // outline 关掉，避免在窄 padding 里溢出顶到 sidebar 容器被截。
              // Focus indicator lives on the wrapper (ring-inset, no clipping). Drop
              // the Link's own outline so it doesn't bleed into the sidebar edge.
              aria-current={isActive ? "page" : undefined}
              className="min-w-0 flex-1 cursor-default rounded-lg focus-visible:outline-none"
              params={{ sessionId: conversation.id, slug }}
              to="/w/$slug/agent/$sessionId"
              onClick={closeOnNavigate}
            >
              {itemBody}
            </Link>
          }
        />
        <TooltipContent side="right">
          {conversation.isTitleGenerating
            ? GENERATING_CHAT_TITLE
            : conversation.title || "未命名对话"}
        </TooltipContent>
      </Tooltip>

      <div className="relative mr-0.5 flex h-7 w-12 shrink-0 items-center justify-end group-data-[collapsible=icon]:hidden">
        <time
          className={cn(
            "absolute right-0.5 whitespace-nowrap text-muted-foreground/70 text-xs tabular-nums transition-opacity group-focus-within/session-item:opacity-0 group-hover/session-item:opacity-0",
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
                className="absolute right-0 size-7 cursor-default rounded-md opacity-0 transition-opacity group-focus-within/session-item:opacity-100 group-hover/session-item:opacity-100 hover:bg-danger-subtle-hover hover:text-danger-foreground focus-visible:opacity-100 data-popup-open:opacity-100"
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

function ChatSessionListSkeleton({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <output aria-busy="true" aria-label="会话列表加载中" className="block">
        <ul className="space-y-1.5 px-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index}>
              <div className="rounded-lg px-1.5 py-1.5">
                <Skeleton
                  className={cn("h-1.5 rounded-full", index % 2 === 0 ? "w-full" : "w-3/4")}
                />
              </div>
            </li>
          ))}
        </ul>
      </output>
    );
  }

  return (
    <output aria-busy="true" aria-label="会话列表加载中" className="block">
      <ul className="space-y-0.5 px-1.5 py-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index}>
            <div className="flex items-center gap-1 rounded-lg border border-transparent px-1 py-0.5">
              <div className="min-w-0 flex-1 rounded-md px-2 py-1">
                <Skeleton className={cn("h-5 max-w-full", index % 3 === 0 ? "w-4/5" : "w-3/5")} />
              </div>
              <div className="flex h-7 w-12 shrink-0 items-center justify-end pr-1">
                <Skeleton className="h-3 w-8" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </output>
  );
}

function ChatSidebarBody({
  conversations,
  isLoading,
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
  isLoading: boolean;
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
  const isCollapsed = !isMobile && state === "collapsed";
  const { containerRef, hideMenuHighlight, hoverHighlight, moveToMenuItem } =
    useSidebarMenuHoverHighlight<HTMLUListElement>();

  const closeOnNavigate = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  if (isLoading) {
    return <ChatSessionListSkeleton collapsed={isCollapsed} />;
  }

  if (conversations.length === 0) {
    if (isCollapsed) {
      return null;
    }

    return <p className="px-3 py-3 text-muted-foreground text-xs">暂无聊天记录</p>;
  }

  return (
    <TooltipProvider delay={400}>
      <ul
        className="relative flex flex-col gap-px px-2"
        onPointerLeave={hideMenuHighlight}
        ref={containerRef}
      >
        {hoverHighlight}
        {conversations.map((conversation) => {
          const isActive = activeSessionId === conversation.id;
          const isSelected = selectedIds.has(conversation.id);
          const visibleTitle = conversation.isTitleGenerating
            ? GENERATING_CHAT_TITLE
            : conversation.title;

          const itemBody = (
            <div className="relative flex h-8 min-w-0 select-none items-center px-2 text-left">
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-2 h-1 rounded-full opacity-0 transition-opacity duration-180 group-data-[collapsible=icon]:opacity-100 motion-reduce:transition-none",
                  isActive ? "w-4 bg-sidebar-foreground/40" : "w-3 bg-muted-foreground/20",
                )}
              />
              <span className="truncate text-[13px] leading-5 transition-[opacity,transform] duration-180 group-data-[collapsible=icon]:-translate-x-2 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
                {visibleTitle || "未命名对话"}
              </span>
            </div>
          );

          return (
            <li key={conversation.id}>
              <div
                className={cn(
                  "group/session-item relative z-10 flex h-8 w-full cursor-default items-center gap-1 rounded-lg ring-sidebar-ring transition-[width,background-color,box-shadow,transform] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] has-focus-visible:ring-2 has-focus-visible:ring-inset group-data-[collapsible=icon]:w-8 has-[a:active]:scale-[0.98] motion-reduce:transition-none motion-reduce:has-[a:active]:scale-100",
                  isActive && (!editMode || isCollapsed)
                    ? "bg-sidebar-active font-medium text-sidebar-accent-foreground shadow-default hover:bg-sidebar-active-hover"
                    : "hover:bg-transparent!",
                  editMode && !isCollapsed && isSelected && "bg-sidebar-accent",
                )}
                onPointerEnter={(event) => moveToMenuItem(event.currentTarget)}
              >
                {renderSessionItem({
                  closeOnNavigate,
                  conversation,
                  deleteTargetId,
                  deletingConversationId,
                  editMode: editMode && !isCollapsed,
                  isActive,
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
    </TooltipProvider>
  );
}

async function loadConversationList(slug: string): Promise<ConversationListItem[]> {
  const rows = await fetchConversations(slug);
  return rows.flatMap((item) =>
    isStudioResumeChatId(item.id)
      ? []
      : [
          {
            id: item.id,
            isTitleGenerating: item.isTitleGenerating,
            title: item.title,
            updatedAt: item.updatedAt,
          },
        ],
  );
}

export function ChatSidebarSlots({
  active,
  direction,
}: {
  active: boolean;
  direction: SidebarSlotDirection;
}) {
  const navigate = useNavigate();
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { setOpenMobile, isMobile } = useSidebar();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const activeSessionId = useActiveSessionId();
  const conversationListKey = chatConversationKeys.list(slug);

  const {
    data: conversations = [],
    isPending: isListPending,
    refetch: refetchConversationList,
  } = useQuery({
    // Keep list across Agent/Studio tab switches; only drop after idle GC.
    gcTime: 5 * 60 * 1000,
    queryFn: () => loadConversationList(slug),
    queryKey: conversationListKey,
    // Poll while Agent panel is visible to stay close to server truth.
    refetchInterval: active ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    // Always stale so focus / panel-switch refetch hits the network.
    staleTime: 0,
  });

  const invalidateConversationList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: conversationListKey });
  }, [conversationListKey, queryClient]);

  const handleStartNewConversation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    window.dispatchEvent(new CustomEvent(CHAT_EVENTS.startNewConversation));
    void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
  }, [isMobile, navigate, setOpenMobile, slug]);

  // Refetch when Agent tab becomes active (cache still shows immediately).
  useEffect(() => {
    if (!active) {
      return;
    }
    void refetchConversationList();
  }, [active, refetchConversationList]);

  // Event-driven invalidation from chat writes (create / title / finish / delete).
  useEffect(() => {
    const handleListChanged = () => {
      void invalidateConversationList();
    };
    window.addEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
    return () => {
      window.removeEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
    };
  }, [invalidateConversationList]);

  useEffect(() => {
    if (!active) {
      return;
    }

    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [active]);

  useEffect(() => {
    if (active) {
      return;
    }

    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setBulkConfirmOpen(false);
    setDeleteTargetId(null);
    setEditMode(false);
    setSelectedIds(new Set());
  }, [active]);

  const toggleEditMode = useCallback(() => {
    if (editMode) {
      setSelectedIds(new Set());
    }
    setEditMode(!editMode);
  }, [editMode]);

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
    await withCleanup(
      () => Promise.allSettled(ids.map((id) => deleteConversation(slug, id))),
      () => setIsBulkDeleting(false),
    );

    setBulkConfirmOpen(false);
    setSelectedIds(new Set());
    setEditMode(false);
    notifyConversationsChanged();
    await invalidateConversationList();

    if (activeSessionId && ids.includes(activeSessionId)) {
      void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
    }
  }, [activeSessionId, invalidateConversationList, navigate, selectedIds, slug]);

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
      await runAsyncAction({
        cleanup: () => setDeletingConversationId(null),
        operation: () => deleteConversation(slug, id),
      });
      setDeleteTargetId(null);
      notifyConversationsChanged();
      await invalidateConversationList();

      if (activeSessionId === id) {
        void navigate({ params: { slug }, replace: true, to: "/w/$slug/agent" });
      }
    },
    [activeSessionId, invalidateConversationList, navigate, slug],
  );

  return (
    <>
      <SidebarHeaderPortalContent>
        <SidebarSlotTransition
          active={active}
          direction={direction}
          panelKey="agent-sidebar-header"
        >
          <ChatSidebarHeader
            editMode={editMode}
            isBulkDeleting={isBulkDeleting}
            onBulkDelete={() => setBulkConfirmOpen(true)}
            onNewConversation={handleStartNewConversation}
            onToggleEditMode={toggleEditMode}
            selectedCount={selectedIds.size}
          />
        </SidebarSlotTransition>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarSlotTransition active={active} direction={direction} panelKey="agent-sidebar-body">
          <ChatSidebarBody
            activeSessionId={activeSessionId}
            conversations={conversations}
            deleteTargetId={deleteTargetId}
            deletingConversationId={deletingConversationId}
            editMode={editMode}
            isLoading={isListPending}
            now={now}
            onConfirmDelete={confirmDelete}
            onDeleteOpenChange={handleDeleteOpenChange}
            onToggleSelect={handleToggleSelect}
            selectedIds={selectedIds}
            slug={slug}
          />
        </SidebarSlotTransition>
      </SidebarBodyPortalContent>

      {active ? (
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
      ) : null}
    </>
  );
}
