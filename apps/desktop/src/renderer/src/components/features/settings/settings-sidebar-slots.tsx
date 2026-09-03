import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import type { AppIconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const settingsSections: {
  icon: AppIconName;
  title: string;
  to: "/settings/appearance" | "/settings/general" | "/settings/transcription";
}[] = [
  {
    icon: "ph:gear",
    title: "通用",
    to: "/settings/general",
  },
  {
    icon: "ph:monitor",
    title: "外观",
    to: "/settings/appearance",
  },
  {
    icon: "ph:waveform",
    title: "实时转录",
    to: "/settings/transcription",
  },
];

/**
 * Settings-route sidebar content — category nav co-located with the settings
 * page, teleported into the shell sidebar via Magic Portal.
 *
 * Each menu item targets its own settings route so navigation, active state,
 * history, and deep links all behave like real pages.
 */
export function SettingsSidebarSlots() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <>
      <SidebarHeaderPortalContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/">
                  <Icon icon="ph:arrow-left" />
                  <span>返回</span>
                </Link>
              }
              tooltip="返回"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupLabel>设置</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsSections.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={pathname === item.to}
                    render={
                      <Link activeOptions={{ exact: true }} to={item.to}>
                        <Icon icon={item.icon} />
                        <span>{item.title}</span>
                      </Link>
                    }
                    tooltip={item.title}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
