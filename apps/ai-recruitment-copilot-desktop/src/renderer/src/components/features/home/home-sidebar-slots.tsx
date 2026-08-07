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
 * Home-route sidebar content. 工作台 → 招聘台 (resume library).
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
                  icon: "ph:briefcase",
                  title: "招聘台",
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
