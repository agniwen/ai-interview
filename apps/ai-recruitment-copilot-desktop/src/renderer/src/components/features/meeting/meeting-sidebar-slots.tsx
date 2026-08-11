import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { meetingDisplayTitle } from "@arc/shared/utils/time";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarNavItem } from "@/components/layout/app-sidebar/sidebar-nav-item";
import { Icon } from "@/components/ui/icon";
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
import { desktopMeetingKeys, restoreMeeting, trashMeeting } from "@/lib/client/meetings";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";
import { useMeetingRecording } from "./meeting-recording-context";
import { useMeetingLibrary } from "./use-meeting-library";

/**
 * 通过 Sidebar Portal 注入 Meeting 导航与最近会议，复用 Library Query 而不创建第二份列表状态。
 * Injects meeting navigation/recent items through sidebar portals while reusing the Library query as the sole list state.
 */
export function MeetingSidebarSlots() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const { captureSnapshot } = useMeetingRecording();
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
        action: {
          label: "撤回",
          onClick: () => restoreMutation.mutate({ meetingId, slug, toastId }),
        },
      });

      if (pathname === `/meetings/${meetingId}` || pathname.startsWith(`/meetings/${meetingId}/`)) {
        await navigate({ to: "/meetings" });
      }
    },
  });

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
            active={pathname === "/"}
            item={{
              icon: "ph:briefcase",
              title: "AI Recruitment Copilot 招聘台",
              to: "/",
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
                    const title = meetingDisplayTitle(meeting.title, meeting.savedAt);
                    const canTrash = canManageMeetingLifecycle(meeting.accessRole);
                    return (
                      <SidebarMenuItem key={meeting.id}>
                        <SidebarMenuButton
                          isActive={
                            pathname === `/meetings/${meeting.id}` ||
                            pathname.startsWith(`/meetings/${meeting.id}/`)
                          }
                          render={
                            <Link params={{ meetingId: meeting.id }} to="/meetings/$meetingId">
                              <Icon icon="ph:waveform" />
                              <span>{title}</span>
                            </Link>
                          }
                          tooltip={title}
                        />
                        {canTrash && workspace ? (
                          <SidebarMenuAction
                            aria-label={`将${title}移入废纸篓`}
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={trashMutation.isPending}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              trashMutation.mutate({ meetingId: meeting.id, slug: workspace.slug });
                            }}
                            showOnHover
                            title="移入废纸篓"
                            type="button"
                          >
                            <Icon icon="ph:trash" />
                          </SidebarMenuAction>
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
