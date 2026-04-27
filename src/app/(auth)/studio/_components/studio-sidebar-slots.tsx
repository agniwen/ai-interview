"use client";

import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  UserCircleIcon,
} from "lucide-react";
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

const navItems = [
  {
    href: "/studio/interviews",
    icon: BotIcon,
    title: "AI 面试管理",
  },
  {
    href: "/studio/departments",
    icon: Building2Icon,
    title: "部门管理",
  },
  {
    href: "/studio/interviewers",
    icon: UserCircleIcon,
    title: "面试官管理",
  },
  {
    href: "/studio/job-descriptions",
    icon: FileTextIcon,
    title: "在招岗位管理",
  },
  {
    href: "/studio/forms",
    icon: ClipboardListIcon,
    title: "面试前问卷模版",
  },
  {
    href: "/studio/interview-questions",
    icon: ListChecksIcon,
    title: "面试中问题模版",
  },
];

export function StudioSidebarSlots() {
  const pathname = usePathname();
  const { state } = useSidebar();

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
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
