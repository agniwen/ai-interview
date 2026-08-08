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

export function MeetingSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { openMeetingRecording } = useMeetingRecording();
  const { meetingsQuery } = useMeetingLibrary();
  return (
    <>
      <SidebarHeaderPortalContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="font-normal"
              isActive={false}
              onClick={() => openMeetingRecording()}
              tooltip="新建会议录制"
            >
              <Icon icon="ph:record" />
              <span>新建会议录制</span>
            </SidebarMenuButton>
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
              {meetingsQuery.isPending ? (
                <>
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                </>
              ) : (
                (meetingsQuery.data ?? []).map((meeting) => (
                  <SidebarMenuItem key={meeting.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/meetings/${meeting.id}`}
                      render={
                        <Link params={{ meetingId: meeting.id }} to="/meetings/$meetingId">
                          <Icon icon="ph:waveform" />
                          <span>{meeting.title}</span>
                        </Link>
                      }
                      tooltip={meeting.title}
                    />
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
