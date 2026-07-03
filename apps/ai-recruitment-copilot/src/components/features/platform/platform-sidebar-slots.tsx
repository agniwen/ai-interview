"use client";

import { IconBuilding, IconInbox, IconListCheck, IconUsers } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  path: string;
  icon: typeof IconBuilding;
  title: string;
}

const navItems: NavItem[] = [
  {
    icon: IconBuilding,
    path: "/platform/organizations",
    title: "所有工作区",
  },
  {
    icon: IconUsers,
    path: "/platform/users",
    title: "所有用户",
  },
  {
    icon: IconInbox,
    path: "/platform/mail-ingest-accounts",
    title: "邮箱监听",
  },
  {
    icon: IconListCheck,
    path: "/platform/queues",
    title: "队列任务",
  },
];

export function PlatformSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { state } = useSidebar();

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  return (
    <>
      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupLabel>平台管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive(item.path)}
                      render={
                        <Link to={item.path}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      }
                      tooltip={item.title}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL="/platform/organizations"
          collapsed={state === "collapsed"}
          showHomeLink={true}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
