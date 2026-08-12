import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { meetingDisplayTitle } from "@arc/shared/utils/time";
import { useEffect, useRef, useState } from "react";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarNavItem } from "@/components/layout/app-sidebar/sidebar-nav-item";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  desktopMeetingKeys,
  renameMeeting,
  restoreMeeting,
  trashMeeting,
} from "@/lib/client/meetings";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";
import { useMeetingCaptureSnapshot } from "./meeting-recording-context";
import { useMeetingLibrary } from "./use-meeting-library";

/**
 * 通过 Sidebar Portal 注入 Meeting 导航与最近会议，复用 Library Query 而不创建第二份列表状态。
 * Injects meeting navigation/recent items through sidebar portals while reusing the Library query as the sole list state.
 */
export function MeetingSidebarSlots() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editingFormRef = useRef<HTMLFormElement>(null);
  const captureSnapshot = useMeetingCaptureSnapshot();
  const { meetingsQuery, workspace } = useMeetingLibrary();
  const activeCaptureId = captureSnapshot.active?.captureId;
  const meetings = meetingsQuery.data ?? [];
  const meetingsWithoutActive = activeCaptureId
    ? meetings.filter((meeting) => meeting.id !== activeCaptureId)
    : meetings;
  const refreshMeetingLists = (slug: string) =>
    Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: desktopMeetingKeys.all(slug) }),
      queryClient.invalidateQueries({ exact: true, queryKey: desktopMeetingKeys.trash(slug) }),
    ]);
  const restoreMutation = useMutation({
    mutationFn: ({
      meetingId,
      slug,
    }: {
      meetingId: string;
      slug: string;
      toastId: string | number;
    }) => restoreMeeting(slug, meetingId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "撤回删除失败");
    },
    onSuccess: async (_, { slug, toastId }) => {
      await refreshMeetingLists(slug);
      toast.dismiss(toastId);
    },
  });
  const trashMutation = useMutation({
    mutationFn: ({ meetingId, slug }: { meetingId: string; slug: string }) =>
      trashMeeting(slug, meetingId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "移入废纸篓失败");
    },
    onSuccess: async (_, { meetingId, slug }) => {
      void refreshMeetingLists(slug);

      const toastId = toast.success("已移入废纸篓", {
        action: (
          <Button
            className="ml-auto"
            onClick={() => restoreMutation.mutate({ meetingId, slug, toastId })}
            size="sm"
            type="button"
          >
            撤回
          </Button>
        ),
        style: { paddingBlock: "8px" },
      });

      if (pathname === `/meetings/${meetingId}` || pathname.startsWith(`/meetings/${meetingId}/`)) {
        await navigate({ to: "/meetings" });
      }
    },
  });
  const renameMutation = useMutation({
    mutationFn: ({ meetingId, slug, title }: { meetingId: string; slug: string; title: string }) =>
      renameMeeting(slug, meetingId, title),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "修改会议名称失败");
    },
    onSuccess: async (_, { meetingId, slug }) => {
      await Promise.all([
        queryClient.invalidateQueries({ exact: true, queryKey: desktopMeetingKeys.all(slug) }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: desktopMeetingKeys.detail(slug, meetingId),
        }),
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.searchRoot(slug) }),
      ]);
      setEditingMeetingId(null);
      setEditingTitle("");
    },
  });

  function cancelEditing() {
    setEditingMeetingId(null);
    setEditingTitle("");
  }

  useEffect(() => {
    if (!editingMeetingId) {
      return;
    }

    function cancelEditingOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && editingFormRef.current?.contains(event.target)) {
        return;
      }
      if (event.target instanceof Element && event.target.closest("[data-meeting-edit-action]")) {
        return;
      }
      setEditingMeetingId(null);
      setEditingTitle("");
    }

    document.addEventListener("click", cancelEditingOnOutsideClick);
    return () => {
      document.removeEventListener("click", cancelEditingOnOutsideClick);
    };
  }, [editingMeetingId]);

  return (
    <>
      <SidebarHeaderPortalContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="font-normal"
              isActive={pathname === "/meetings/new"}
              render={
                <Link search={{}} to="/meetings/new">
                  <Icon icon="ph:record" />
                  <span>新建会议录制</span>
                </Link>
              }
              tooltip="新建会议录制"
            />
          </SidebarMenuItem>
          <SidebarNavItem
            active={pathname === "/recruitment"}
            item={{
              icon: "ph:briefcase",
              title: "AI Recruitment Copilot 招聘台",
              to: "/recruitment",
            }}
          />
          <SidebarNavItem
            active={pathname === "/meetings"}
            item={{ icon: "ph:waveform", title: "会议记录", to: "/meetings" }}
          />
        </SidebarMenu>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
          <SidebarGroupLabel>录制记录</SidebarGroupLabel>
          <SidebarGroupContent className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full" orientation="vertical" scrollbars="leave">
              <SidebarMenu>
                {activeCaptureId ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={
                        pathname === `/meetings/${activeCaptureId}` ||
                        pathname.startsWith(`/meetings/${activeCaptureId}/`)
                      }
                      render={
                        <Link params={{ meetingId: activeCaptureId }} to="/meetings/$meetingId">
                          <Icon className="text-red-500" icon="ph:record-fill" />
                          <span>录制中…</span>
                        </Link>
                      }
                      tooltip="录制中"
                    />
                  </SidebarMenuItem>
                ) : null}
                {meetingsQuery.isPending ? (
                  <>
                    <SidebarMenuSkeleton />
                    <SidebarMenuSkeleton />
                    <SidebarMenuSkeleton />
                  </>
                ) : (
                  meetingsWithoutActive.map((meeting) => {
                    const title = meetingDisplayTitle(meeting.title);
                    const canTrash = canManageMeetingLifecycle(meeting.accessRole);
                    const isEditing = editingMeetingId === meeting.id;
                    if (isEditing && workspace) {
                      const normalizedTitle = editingTitle.trim();
                      return (
                        <SidebarMenuItem
                          className="rounded-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          key={meeting.id}
                        >
                          <form
                            className="px-0.5 py-0.5"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (!normalizedTitle) {
                                return;
                              }
                              if (normalizedTitle === title) {
                                cancelEditing();
                                return;
                              }
                              renameMutation.mutate({
                                meetingId: meeting.id,
                                slug: workspace.slug,
                                title: normalizedTitle,
                              });
                            }}
                            ref={editingFormRef}
                          >
                            <Input
                              aria-label={`编辑${title}的名称`}
                              autoFocus
                              className="h-7 pr-12 text-sm"
                              disabled={renameMutation.isPending}
                              maxLength={120}
                              onChange={(event) => setEditingTitle(event.currentTarget.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelEditing();
                                }
                              }}
                              value={editingTitle}
                            />
                            <SidebarMenuAction
                              aria-label={`保存${title}的名称`}
                              className="right-7 text-muted-foreground hover:bg-transparent hover:text-foreground"
                              disabled={!normalizedTitle || renameMutation.isPending}
                              title="保存名称"
                              type="submit"
                            >
                              <Icon icon="ph:check" />
                            </SidebarMenuAction>
                            <SidebarMenuAction
                              aria-label={`取消编辑${title}的名称`}
                              className="hover:bg-transparent hover:text-foreground"
                              disabled={renameMutation.isPending}
                              onClick={cancelEditing}
                              title="取消编辑"
                              type="button"
                            >
                              <Icon icon="ph:x" />
                            </SidebarMenuAction>
                          </form>
                        </SidebarMenuItem>
                      );
                    }
                    return (
                      <SidebarMenuItem
                        className="rounded-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        key={meeting.id}
                      >
                        <SidebarMenuButton
                          className={canTrash ? "pr-14" : undefined}
                          isActive={
                            pathname === `/meetings/${meeting.id}` ||
                            pathname.startsWith(`/meetings/${meeting.id}/`)
                          }
                          render={
                            <Link params={{ meetingId: meeting.id }} to="/meetings/$meetingId">
                              <span>{title}</span>
                            </Link>
                          }
                          tooltip={title}
                        />
                        {canTrash && workspace ? (
                          <>
                            <SidebarMenuAction
                              aria-label={`编辑${title}的名称`}
                              className="right-7 text-muted-foreground hover:bg-transparent hover:text-foreground"
                              data-meeting-edit-action
                              disabled={trashMutation.isPending || renameMutation.isPending}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setEditingMeetingId(meeting.id);
                                setEditingTitle(title);
                              }}
                              showOnHover
                              title="编辑名称"
                              type="button"
                            >
                              <Icon icon="ph:pencil-line" />
                            </SidebarMenuAction>
                            <SidebarMenuAction
                              aria-label={`将${title}移入废纸篓`}
                              className="text-muted-foreground hover:bg-transparent hover:text-destructive"
                              disabled={trashMutation.isPending || renameMutation.isPending}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                trashMutation.mutate({
                                  meetingId: meeting.id,
                                  slug: workspace.slug,
                                });
                              }}
                              showOnHover
                              title="移入废纸篓"
                              type="button"
                            >
                              <Icon icon="ph:trash" />
                            </SidebarMenuAction>
                          </>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
