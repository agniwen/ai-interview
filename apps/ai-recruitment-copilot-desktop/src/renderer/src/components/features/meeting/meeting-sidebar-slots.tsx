import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarNavItem } from "@/components/layout/app-sidebar/sidebar-nav-item";
import { Icon } from "@/components/ui/icon";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useMeetingRecording } from "./meeting-recording-context";
import { useMeetingLibrary } from "./use-meeting-library";
import { meetingDisplayTitle } from "@arc/shared/utils/time";

/**
 * 通过 Sidebar Portal 注入 Meeting 导航与最近会议，复用 Library Query 而不创建第二份列表状态。
 * Injects meeting navigation/recent items through sidebar portals while reusing the Library query as the sole list state.
 */
export function MeetingSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { captureSnapshot } = useMeetingRecording();
  const { meetingsQuery } = useMeetingLibrary();
  const activeCaptureId = captureSnapshot.active?.captureId;
  const meetings = meetingsQuery.data ?? [];
  const meetingsWithoutActive = activeCaptureId
    ? meetings.filter((meeting) => meeting.id !== activeCaptureId)
    : meetings;

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
        <SidebarGroup>
          <SidebarGroupLabel>录制记录</SidebarGroupLabel>
          <SidebarGroupContent>
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
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
