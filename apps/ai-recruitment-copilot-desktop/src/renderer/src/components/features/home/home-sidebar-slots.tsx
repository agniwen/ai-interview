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
} from "@/components/ui/sidebar";

/**
 * Home-route sidebar content, co-located with the home page and teleported
 * into the shell sidebar via Magic Portal (same model as studio slots).
 * Settings lives on the content title bar, not here.
 */
export function HomeSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/";

  return (
    <>
      <SidebarHeaderPortalContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="font-normal"
              isActive={false}
              render={
                <Link to="/">
                  <Icon icon="ph:plus" />
                  <span>新建对话</span>
                </Link>
              }
              tooltip="新建对话"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem
                active={isHome}
                item={{
                  icon: "ph:chat-circle",
                  title: "对话记录",
                  to: "/",
                }}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>最近</SidebarGroupLabel>
          <SidebarGroupContent>
            <p className="px-2 py-1.5 text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
              暂无会话
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>
    </>
  );
}
