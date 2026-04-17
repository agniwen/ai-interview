"use client";

import { BotIcon } from "lucide-react";
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
import { useStudioTutorialContext } from "./studio-tutorial-provider";

const navItems = [
  {
    href: "/studio/interviews",
    icon: BotIcon,
    title: "AI 面试管理",
  },
];

export function StudioSidebarSlots() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { startTutorial } = useStudioTutorialContext();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupLabel>AI 面试</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link href={item.href}>
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
          callbackURL="/studio"
          collapsed={state === "collapsed"}
          onStartTutorial={startTutorial}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
