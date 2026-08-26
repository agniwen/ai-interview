import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { meetingDisplayTitle } from "@arc/shared/utils/time";
import { useEffect, useRef, useState } from "react";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarNavItem } from "@/components/layout/app-sidebar/sidebar-nav-item";
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
import { showMeetingArchivedToast } from "./meeting-archive-toast";
import { meetingCapture } from "@/lib/meeting-capture";
import { useMeetingCaptureSnapshot, useMeetingRecordingActions } from "./meeting-recording-context";
import {
  collectLocalMeetingSidebarRecords,
  collectRemotelyVisibleVerifiedIds,
} from "./meeting-sidebar-records";
import { useMeetingLibrary } from "./use-meeting-library";

function localMeetingIcon(
  state: ReturnType<typeof collectLocalMeetingSidebarRecords>[number]["state"],
): string {
  if (state === "active" || state === "recording") {
    return "ph:record-fill";
  }
  if (state === "interrupted" || state === "paused") {
    return "ph:pause-circle";
  }
  return "ph:cloud-arrow-up";
}

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
  const { requestDiscard } = useMeetingRecordingActions();
  const { meetingsQuery, workspace } = useMeetingLibrary();
  const localMeetings = collectLocalMeetingSidebarRecords(captureSnapshot);
  const localMeetingIds = new Set(localMeetings.map((meeting) => meeting.captureId));
  const meetings = meetingsQuery.data ?? [];
  const remotelyVisibleVerifiedIds = collectRemotelyVisibleVerifiedIds(
    captureSnapshot,
    new Set(meetings.map((meeting) => meeting.id)),
  ).join(",");
  const meetingsWithoutLocal = meetings.filter((meeting) => !localMeetingIds.has(meeting.id));
  const showLocalRemoteDivider =
    localMeetings.length > 0 && (meetingsQuery.isPending || meetingsWithoutLocal.length > 0);
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
      toast.error(error instanceof Error ? error.message : "撤回归档失败");
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
      toast.error(error instanceof Error ? error.message : "归档失败");
    },
    onSuccess: async (_, { meetingId, slug }) => {
      void refreshMeetingLists(slug);

      showMeetingArchivedToast((toastId) => restoreMutation.mutate({ meetingId, slug, toastId }));

      if (pathname === `/meetings/${meetingId}` || pathname.startsWith(`/meetings/${meetingId}/`)) {
        await navigate({ to: "/meetings" });
      }
    },
  });
  const renameMutation = useMutation({
    mutationFn: (
      input:
        | { meetingId: string; source: "local"; title: string }
        | { meetingId: string; slug: string; source: "remote"; title: string },
    ) =>
      input.source === "local"
        ? meetingCapture.updateLocalSession(input.meetingId, { title: input.title })
        : renameMeeting(input.slug, input.meetingId, input.title),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "修改录制名称失败");
    },
    onSuccess: async (_, input) => {
      if (input.source === "remote") {
        await Promise.all([
          queryClient.invalidateQueries({
            exact: true,
            queryKey: desktopMeetingKeys.all(input.slug),
          }),
          queryClient.invalidateQueries({
            exact: true,
            queryKey: desktopMeetingKeys.detail(input.slug, input.meetingId),
          }),
          queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.searchRoot(input.slug) }),
        ]);
      }
      setEditingMeetingId(null);
      setEditingTitle("");
    },
  });

  function cancelEditing() {
    setEditingMeetingId(null);
    setEditingTitle("");
  }

  useEffect(() => {
    if (!remotelyVisibleVerifiedIds) {
      return;
    }
    const acknowledgeRemoteVisibility = async () => {
      for (const captureId of remotelyVisibleVerifiedIds.split(",")) {
        try {
          await meetingCapture.acknowledgeRemoteVisibility(captureId);
        } catch (error) {
          console.warn("[meeting-capture] remote visibility handoff failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
    };
    void acknowledgeRemoteVisibility();
  }, [remotelyVisibleVerifiedIds]);

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
                  <span>创建录制</span>
                </Link>
              }
              tooltip="创建录制"
            />
          </SidebarMenuItem>
          <SidebarNavItem
            active={
              pathname === "/recruitment" ||
              pathname.startsWith("/recruitment/") ||
              pathname.startsWith("/resumes/")
            }
            item={{
              icon: "ph:briefcase",
              title: "AI Recruitment Copilot 招聘台",
              to: "/recruitment",
            }}
          />
          <SidebarNavItem
            active={pathname === "/meetings"}
            item={{ icon: "ph:waveform", title: "录制记录", to: "/meetings" }}
          />
        </SidebarMenu>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
          <SidebarGroupLabel>录制记录</SidebarGroupLabel>
          <SidebarGroupContent className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full" orientation="vertical" scrollbars="leave">
              <SidebarMenu>
                {localMeetings.map((meeting) => {
                  const isEditing = editingMeetingId === meeting.captureId;
                  const normalizedTitle = editingTitle.trim();
                  if (isEditing) {
                    return (
                      <SidebarMenuItem
                        className="rounded-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        key={`local-${meeting.captureId}`}
                      >
                        <form
                          className="px-0.5 py-0.5"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (
                              !normalizedTitle ||
                              normalizedTitle.length > RECORDING_TITLE_MAX_LENGTH
                            ) {
                              return;
                            }
                            if (normalizedTitle === meeting.title) {
                              cancelEditing();
                              return;
                            }
                            renameMutation.mutate({
                              meetingId: meeting.captureId,
                              source: "local",
                              title: normalizedTitle,
                            });
                          }}
                          ref={editingFormRef}
                        >
                          <Input
                            aria-label={`编辑${meeting.title}的名称`}
                            autoFocus
                            className="h-7 pr-12 text-sm"
                            disabled={renameMutation.isPending}
                            maxLength={RECORDING_TITLE_MAX_LENGTH}
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
                            aria-label={`保存${meeting.title}的名称`}
                            className="right-7 text-muted-foreground hover:bg-transparent hover:text-foreground"
                            disabled={
                              !normalizedTitle ||
                              normalizedTitle.length > RECORDING_TITLE_MAX_LENGTH ||
                              renameMutation.isPending
                            }
                            title="保存名称"
                            type="submit"
                          >
                            <Icon icon="ph:check" />
                          </SidebarMenuAction>
                          <SidebarMenuAction
                            aria-label={`取消编辑${meeting.title}的名称`}
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
                  const includeSaved = !["active", "recording", "paused", "interrupted"].includes(
                    meeting.state,
                  );
                  return (
                    <SidebarMenuItem
                      className="rounded-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      key={`local-${meeting.captureId}`}
                    >
                      <SidebarMenuButton
                        className="pr-16!"
                        isActive={
                          pathname === `/meetings/${meeting.captureId}` ||
                          pathname.startsWith(`/meetings/${meeting.captureId}/`)
                        }
                        render={
                          <Link params={{ meetingId: meeting.captureId }} to="/meetings/$meetingId">
                            <Icon
                              className={
                                meeting.state === "active" || meeting.state === "recording"
                                  ? "text-red-500"
                                  : undefined
                              }
                              icon={localMeetingIcon(meeting.state)}
                            />
                            <span className="min-w-0 flex-1 truncate">{meeting.title}</span>
                          </Link>
                        }
                        tooltip={meeting.title}
                      />
                      <SidebarMenuAction
                        aria-label={`编辑${meeting.title}的名称`}
                        className="right-7 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        data-meeting-edit-action
                        disabled={renameMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setEditingMeetingId(meeting.captureId);
                          setEditingTitle(meeting.title);
                        }}
                        showOnHover
                        title="编辑名称"
                        type="button"
                      >
                        <Icon icon="ph:pencil-line" />
                      </SidebarMenuAction>
                      <SidebarMenuAction
                        aria-label={`删除${meeting.title}的本地数据`}
                        className="text-muted-foreground hover:bg-transparent hover:text-destructive"
                        disabled={renameMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          requestDiscard(meeting.captureId, includeSaved);
                        }}
                        showOnHover
                        title="删除本地数据"
                        type="button"
                      >
                        <Icon icon="ph:trash" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  );
                })}
                {showLocalRemoteDivider ? (
                  <li aria-hidden="true" className="mx-2 my-1">
                    <hr className="border-sidebar-accent/70" />
                  </li>
                ) : null}
                {meetingsQuery.isPending ? (
                  <>
                    <SidebarMenuSkeleton />
                    <SidebarMenuSkeleton />
                    <SidebarMenuSkeleton />
                  </>
                ) : (
                  meetingsWithoutLocal.map((meeting) => {
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
                              if (
                                !normalizedTitle ||
                                normalizedTitle.length > RECORDING_TITLE_MAX_LENGTH
                              ) {
                                return;
                              }
                              if (normalizedTitle === title) {
                                cancelEditing();
                                return;
                              }
                              renameMutation.mutate({
                                meetingId: meeting.id,
                                slug: workspace.slug,
                                source: "remote",
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
                              maxLength={RECORDING_TITLE_MAX_LENGTH}
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
                              disabled={
                                !normalizedTitle ||
                                normalizedTitle.length > RECORDING_TITLE_MAX_LENGTH ||
                                renameMutation.isPending
                              }
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
                          className={canTrash ? "pr-16!" : undefined}
                          isActive={
                            pathname === `/meetings/${meeting.id}` ||
                            pathname.startsWith(`/meetings/${meeting.id}/`)
                          }
                          render={
                            <Link params={{ meetingId: meeting.id }} to="/meetings/$meetingId">
                              <span className="min-w-0 flex-1 truncate">{title}</span>
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
                              aria-label={`归档${title}`}
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
                              title="归档"
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
