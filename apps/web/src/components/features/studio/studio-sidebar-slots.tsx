"use client";

import {
  IconBuilding,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconClipboardList,
  IconFileText,
  IconLayoutGrid,
  IconListCheck,
  IconMailCheck,
  IconMessageChatbot,
  IconRobot,
  IconShieldCheck,
  IconUser,
  IconUserCircle,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
import {
  recruitingBoardStagePresets,
  resolveRecruitingBoardStagePreset,
} from "@app/shared/recruiting-board";
import { Link, useRouterState } from "@tanstack/react-router";
import { SidebarBodyPortalContent } from "@/components/layout/app-sidebar/portals";
import { useSidebarPersistence } from "@/components/layout/sidebar-persistence-context";
import { useSidebarMenuHoverHighlight } from "@/components/layout/app-sidebar/sidebar-menu-hover-highlight";
import { SidebarSlotTransition } from "@/components/layout/app-sidebar/sidebar-slot-transition";
import type { SidebarSlotDirection } from "@/components/layout/app-sidebar/sidebar-slot-transition";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useHasPermission } from "@/hooks/use-has-permission";
import { firstSearchValue } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { statement } from "@app/shared/permissions";

export interface NavItem {
  /** Path under /w/[slug]/studio — leading slash, no slug prefix. */
  path: string;
  icon: typeof IconRobot;
  title: string;
  /** 仅当 page action 通过 useHasPermission 时显示。 */
  action: (typeof statement)["page"][number];
  adminOnly?: boolean;
  resource: "page";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      {
        action: "resumes",
        icon: IconUsers,
        path: "/studio/resumes",
        resource: "page",
        title: "招聘台",
      },
      {
        action: "resumePool",
        icon: IconLayoutGrid,
        path: "/studio/resume-pool",
        resource: "page",
        title: "人才库",
      },
      {
        action: "interviews",
        icon: IconRobot,
        path: "/studio/interviews",
        resource: "page",
        title: "AI 面试",
      },
      {
        action: "interviews",
        icon: IconCalendarEvent,
        path: "/studio/calendar",
        resource: "page",
        title: "日程管理",
      },
      {
        action: "dashboard",
        icon: IconChartBar,
        path: "/studio/dashboard",
        resource: "page",
        title: "数据看板",
      },
    ],
    label: "数据",
  },
  {
    items: [
      {
        action: "departments",
        icon: IconBuilding,
        path: "/studio/departments",
        resource: "page",
        title: "部门管理",
      },
      {
        action: "interviewers",
        icon: IconUserCircle,
        path: "/studio/interviewers",
        resource: "page",
        title: "AI面试官管理",
      },
      {
        action: "jobDescriptions",
        icon: IconFileText,
        path: "/studio/job-descriptions",
        resource: "page",
        title: "岗位设置",
      },
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        action: "forms",
        icon: IconClipboardList,
        path: "/studio/forms",
        resource: "page",
        title: "表单题",
      },
      {
        action: "interviewQuestions",
        icon: IconListCheck,
        path: "/studio/interview-questions",
        resource: "page",
        title: "沟通题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        action: "me",
        icon: IconUser,
        path: "/studio/me",
        resource: "page",
        title: "个人中心",
      },
      {
        action: "members",
        icon: IconUserCog,
        path: "/studio/members",
        resource: "page",
        title: "工作区管理",
      },
      {
        action: "mailIngestAccounts",
        icon: IconMailCheck,
        path: "/studio/mail-ingest-accounts",
        resource: "page",
        title: "邮箱监听",
      },
      {
        action: "permissions",
        icon: IconShieldCheck,
        path: "/studio/permissions",
        resource: "page",
        title: "权限管理",
      },
      {
        action: "globalConfig",
        icon: IconMessageChatbot,
        path: "/studio/global-config",
        resource: "page",
        title: "上下文设置",
      },
    ],
    label: "系统配置",
  },
];

const WORKSPACE_PREFIX_REGEX = /^\/w\/[^/]+/;
const RECRUITING_BOARD_PATH = "/studio/resumes";
export const STUDIO_SIDEBAR_SUBMENU_BUTTON_CLASS =
  "relative z-10 border border-transparent transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[active=true]:border-sidebar-border/60 data-[active=false]:hover:bg-transparent! motion-reduce:transition-none";

export function buildRecruitingBoardSearch(
  previous: SearchParamsRecord,
  preservePrevious: boolean,
  preset?: (typeof recruitingBoardStagePresets)[number],
): SearchParamsRecord {
  const next = preservePrevious ? { ...previous } : {};
  next.boardPreset = preset?.id;
  next.page = 1;
  next.stage = preset?.view;
  return next;
}

export function isStudioSidebarParentActive(
  active: boolean,
  isRecruitingBoard: boolean,
  selectedRecruitingPreset?: string,
): boolean {
  return active && (!isRecruitingBoard || !selectedRecruitingPreset);
}

export function shouldToggleStudioSidebarSubmenu(
  isRecruitingBoard: boolean,
  isParentActive: boolean,
  modifiedNavigation = false,
): boolean {
  return isRecruitingBoard && isParentActive && !modifiedNavigation;
}

export function resolveStudioSidebarNavItem(pathname: string): NavItem | undefined {
  const studioPath = pathname.replace(WORKSPACE_PREFIX_REGEX, "");
  return navGroups
    .flatMap((group) => group.items)
    .find((item) => studioPath === item.path || studioPath.startsWith(`${item.path}/`));
}

function SidebarNavItem({
  item,
  active,
  href,
  onHover,
  selectedRecruitingPreset,
}: {
  item: NavItem;
  active: boolean;
  href: string;
  onHover: (target: HTMLElement) => void;
  selectedRecruitingPreset: string | undefined;
}) {
  // Hook must be called unconditionally
  const allowed = useHasPermission(item.resource, item.action);
  const memberRole = useWorkspaceMemberRole();
  const { menuOpen: sidebarMenuOpen, setMenuOpen: setSidebarMenuOpen } = useSidebarPersistence();

  if (!allowed || (item.adminOnly && memberRole !== "owner" && memberRole !== "admin")) {
    return null;
  }

  const Icon = item.icon;
  const isRecruitingBoard = item.path === RECRUITING_BOARD_PATH;
  const submenuOpen = sidebarMenuOpen[item.path] ?? true;
  const isParentActive = isStudioSidebarParentActive(
    active,
    isRecruitingBoard,
    selectedRecruitingPreset,
  );
  const menuButton = (
    <SidebarMenuButton
      className={`relative z-10 cursor-default select-none border border-transparent transition-[width,height,padding,background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] data-[active=true]:border-sidebar-border/60 data-[active=false]:opacity-90 data-[active=false]:hover:opacity-100 motion-reduce:transition-none motion-reduce:active:scale-100${isParentActive ? "" : " hover:bg-transparent!"}`}
      isActive={isParentActive}
      onPointerEnter={(event) => onHover(event.currentTarget)}
      render={
        <Link
          onClick={(event) => {
            const modifiedNavigation =
              event.button !== 0 ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey;
            if (
              !shouldToggleStudioSidebarSubmenu(
                isRecruitingBoard,
                isParentActive,
                modifiedNavigation,
              )
            ) {
              return;
            }
            event.preventDefault();
            setSidebarMenuOpen((current) => ({
              ...current,
              [item.path]: !(current[item.path] ?? true),
            }));
          }}
          search={
            isRecruitingBoard
              ? (previous) => buildRecruitingBoardSearch(previous, active)
              : undefined
          }
          to={href}
        >
          <Icon />
          <span>{item.title}</span>
        </Link>
      }
      tooltip={item.title}
    />
  );

  if (!isRecruitingBoard) {
    return (
      <SidebarMenuItem className="relative" key={item.path}>
        {menuButton}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className="relative" key={item.path}>
      <Collapsible
        onOpenChange={(open) => {
          setSidebarMenuOpen((current) => ({ ...current, [item.path]: open }));
        }}
        open={submenuOpen}
      >
        {menuButton}
        <CollapsibleTrigger
          aria-label={submenuOpen ? "收起招聘台子菜单" : "展开招聘台子菜单"}
          render={<SidebarMenuAction className="z-20" />}
        >
          <IconChevronRight
            className={`transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none${submenuOpen ? " rotate-90" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {recruitingBoardStagePresets.map((preset) => (
              <SidebarMenuSubItem key={preset.id}>
                <SidebarMenuSubButton
                  className={STUDIO_SIDEBAR_SUBMENU_BUTTON_CLASS}
                  isActive={active && selectedRecruitingPreset === preset.id}
                  onPointerEnter={(event) => onHover(event.currentTarget)}
                  render={
                    <Link
                      resetScroll={false}
                      search={(previous) => buildRecruitingBoardSearch(previous, active, preset)}
                      to={href}
                    >
                      <span>{preset.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function StudioSidebarNavigation() {
  const location = useRouterState({ select: (state) => state.location });
  const { pathname } = location;
  const selectedRecruitingPreset = resolveRecruitingBoardStagePreset(
    firstSearchValue(location.search.boardPreset),
  );
  const slug = useWorkspaceSlug();
  const { containerRef, hideMenuHighlight, hoverHighlight, moveToMenuItem } =
    useSidebarMenuHoverHighlight();

  // 把 nav 表里的 /studio/* 路径包成当前 workspace 的 /w/[slug]/studio/* 链接；
  // 没有 slug (理论上 StudioSidebarSlots 只在 workspace 路由下渲染) 时退回根路径,
  // 让 / 页面再解析活跃 workspace。
  const buildHref = (path: string): string => (slug ? `/w/${slug}${path}` : path);
  const isActive = (path: string) => {
    const href = buildHref(path);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="relative" onPointerLeave={hideMenuHighlight} ref={containerRef}>
      {hoverHighlight}
      {navGroups.map((group) => (
        <SidebarGroup className="hidden has-[[data-sidebar=menu-item]]:flex" key={group.label}>
          <SidebarGroupLabel className="select-none">{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  item={item}
                  active={isActive(item.path)}
                  href={buildHref(item.path)}
                  onHover={moveToMenuItem}
                  selectedRecruitingPreset={selectedRecruitingPreset}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  );
}

export function StudioSidebarSlots({
  active,
  direction,
}: {
  active: boolean;
  direction: SidebarSlotDirection;
}) {
  return (
    <SidebarBodyPortalContent>
      <SidebarSlotTransition active={active} direction={direction} panelKey="studio-sidebar-body">
        <StudioSidebarNavigation />
      </SidebarSlotTransition>
    </SidebarBodyPortalContent>
  );
}
