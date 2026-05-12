"use client";

import { Building2Icon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
} from "@/components/app-sidebar/portals";
import { SidebarUserSection } from "@/components/sidebar-user-section";
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
  icon: typeof Building2Icon;
  title: string;
}

const navItems: NavItem[] = [
  {
    icon: Building2Icon,
    path: "/platform/organizations",
    title: "所有工作区",
  },
  {
    icon: UsersIcon,
    path: "/platform/users",
    title: "所有用户",
  },
];

export function PlatformSidebarSlots() {
  const pathname = usePathname();
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
                    <SidebarMenuButton asChild isActive={isActive(item.path)} tooltip={item.title}>
                      <Link href={item.path}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
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
