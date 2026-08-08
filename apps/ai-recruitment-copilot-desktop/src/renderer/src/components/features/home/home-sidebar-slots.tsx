import { useRouterState } from "@tanstack/react-router";
import { useMeetingRecording } from "@/components/features/meeting/meeting-recording-context";
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
} from "@/components/ui/sidebar";

/**
 * Home-route sidebar content. 工作台 → 招聘台 (resume library).
 */
export function HomeSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/";
  const { openMeetingRecording } = useMeetingRecording();

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
          <SidebarMenu>
            <SidebarNavItem
              active={isHome}
              item={{
                icon: "ph:briefcase",
                title: "AI Recruitment Copilot 招聘台",
                to: "/",
              }}
            />
          </SidebarMenu>
        </SidebarMenu>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupLabel>录制记录</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem
                active={isHome}
                item={{
                  icon: "ph:briefcase",
                  title: "录制记录-2608090332",
                  to: "/",
                }}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
