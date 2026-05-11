"use client";

import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  SettingsIcon,
  UserCircleIcon,
  UserCogIcon,
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
import { authClient } from "@/lib/client/auth-client";

interface NavItem {
  href: string;
  icon: typeof BotIcon;
  title: string;
  /** 仅 better-auth 角色为 admin 时可见。 / Only visible when role === "admin". */
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      {
        href: "/studio/interviews",
        icon: BotIcon,
        title: "AI 面试",
      },
    ],
    label: "工作台",
  },
  {
    items: [
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
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        href: "/studio/forms",
        icon: ClipboardListIcon,
        title: "面试表单",
      },
      {
        href: "/studio/interview-questions",
        icon: ListChecksIcon,
        title: "面试题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        adminOnly: true,
        href: "/studio/system-management",
        icon: UserCogIcon,
        title: "用户管理",
      },
      {
        href: "/studio/global-config",
        icon: SettingsIcon,
        title: "全局配置",
      },
    ],
    label: "系统配置",
  },
];

export function StudioSidebarSlots() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <SidebarBodyPortalContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.href)}
                        tooltip={item.title}
                      >
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
        ))}
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
