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
  section: "appearance" | "general";
  title: string;
}[] = [
  {
    icon: "ph:monitor",
    section: "appearance",
    title: "外观",
  },
  {
    icon: "ph:globe",
    section: "general",
    title: "通用",
  },
];

/**
 * Settings-route sidebar content — category nav co-located with the settings
 * page, teleported into the shell sidebar via Magic Portal.
 *
 * Section links use `?section=` (not `#hash`) because the desktop router is
 * hash-history based (`#/settings`), so fragment anchors would collide.
 */
export function SettingsSidebarSlots() {
  const section = useRouterState({
    select: (state) => {
      const search = state.location.search as { section?: string };
      return search.section ?? "appearance";
    },
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
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton
                    isActive={section === item.section}
                    render={
                      <Link search={{ section: item.section }} to="/settings">
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
