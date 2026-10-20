"use client";

import {
  IconArrowLeft,
  IconBuilding,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconClipboardList,
  IconFileText,
  IconInbox,
  IconLayoutGrid,
  IconListCheck,
  IconMailCheck,
  IconMessageChatbot,
  IconMoon,
  IconRobot,
  IconShieldCheck,
  IconSitemap,
  IconTable,
  IconUser,
  IconUserCircle,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
// 用途：复刻真实 Studio 壳（shadcn Sidebar variant="inset"）。所有尺寸严格按真实组件：
// --sidebar-width 18rem (288px) · --header-height 3rem (48px) · SidebarMenuButton h-8
// SidebarGroup p-2 · SidebarGroupLabel h-8 px-2 text-xs/70 · TabsList p-0.5 + shared indicator。
// Purpose: 1:1 mirror of the real Studio sidebar+inset layout. Width / heights /
// classes match the actual shadcn primitives the production app uses.

import { useOptionalDemo } from "../demo-context";
import { getDemoScreenCopy } from "../demo-screen-copy";
import { DemoAutoplay } from "../demo-autoplay";
import { DemoDialogLayer } from "../demo-dialog";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { RecruitmentCopilotBrand } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as m from "@/paraglide/messages";
import { cn } from "@app/shared/utils";

interface NavItem {
  icon: typeof IconRobot;
  label: string;
  // 招聘台在真实侧栏里带阶段子菜单。 The recruiting desk carries stage sub-items in the real sidebar.
  children?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// 对齐 studio-sidebar-slots.tsx 的 navGroups。
// Mirrors src/components/features/studio/studio-sidebar-slots.tsx.
function getStudioNavGroups(): NavGroup[] {
  return [
    {
      items: [
        {
          children: [
            m.home_frame_nav_sub_screening(),
            m.home_frame_nav_sub_interview(),
            m.home_frame_nav_sub_offer(),
            m.home_frame_nav_sub_onboarding(),
            m.home_frame_tab_closed(),
          ],
          icon: IconUsers,
          label: m.home_frame_nav_recruitment(),
        },
        { icon: IconLayoutGrid, label: m.home_frame_nav_talent_pool() },
        { icon: IconRobot, label: m.home_frame_nav_ai_interview() },
        { icon: IconCalendarEvent, label: m.home_frame_nav_calendar() },
        { icon: IconChartBar, label: m.home_frame_nav_dashboard() },
        { icon: IconTable, label: m.home_frame_nav_ledger() },
        { icon: IconClipboardList, label: m.home_frame_nav_approvals() },
      ],
      label: m.home_frame_nav_workbench(),
    },
    {
      items: [
        { icon: IconBuilding, label: m.home_frame_nav_departments() },
        { icon: IconUserCircle, label: m.home_frame_nav_interviewers() },
        { icon: IconFileText, label: m.home_frame_nav_jobs() },
      ],
      label: m.home_frame_nav_recruitment_config(),
    },
    {
      items: [
        { icon: IconClipboardList, label: m.home_frame_nav_form_questions() },
        { icon: IconListCheck, label: m.home_frame_nav_conversation_questions() },
      ],
      label: m.home_frame_nav_question_bank(),
    },
    {
      items: [
        { icon: IconUser, label: m.home_frame_nav_profile() },
        { icon: IconUserCog, label: m.home_frame_nav_workspace() },
        { icon: IconMailCheck, label: m.home_frame_nav_mail() },
        { icon: IconShieldCheck, label: m.home_frame_nav_permissions() },
        { icon: IconSitemap, label: m.home_frame_nav_approval_flows() },
        { icon: IconMessageChatbot, label: m.home_frame_nav_context() },
      ],
      label: m.home_frame_nav_system(),
    },
  ];
}

// ─────────────────── Tabs (real shadcn Tabs default variant) ───────────────────
interface SidebarTabsProps {
  active: "agent" | "chat" | "studio";
}

function SidebarTabs({ active }: SidebarTabsProps) {
  const value = active === "studio" ? "studio" : "agent";

  return (
    <Tabs activationMode="manual" className="w-full" value={value}>
      <TabsList className="w-full select-none bg-sidebar-accent dark:bg-black/15">
        <TabsTrigger value="agent">{m.home_frame_tab_agent()}</TabsTrigger>
        <TabsTrigger value="studio">{m.home_frame_tab_studio()}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

// ─────────────────── Sidebar body: Studio nav ───────────────────
interface StudioNavProps {
  activeLabel: string;
}

export function StudioNav({ activeLabel }: StudioNavProps) {
  const studioNavGroups = getStudioNavGroups();
  const demo = useOptionalDemo();

  return (
    <>
      {studioNavGroups.map((group) => (
        <div
          // SidebarGroup: relative flex w-full min-w-0 flex-col p-2
          className="relative flex w-full min-w-0 flex-col p-2"
          key={group.label}
        >
          <div
            // SidebarGroupLabel: h-8 px-2 text-xs font-medium text-sidebar-foreground/70
            className="flex h-8 shrink-0 items-center rounded-md px-2 font-medium text-sidebar-foreground/70 text-xs"
          >
            {group.label}
          </div>
          <ul className="flex w-full min-w-0 flex-col gap-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.label === (demo?.page ?? activeLabel);
              return (
                <li className="relative" key={item.label}>
                  <button
                    type="button"
                    data-demo-page={item.label}
                    // SidebarMenuButton default: flex w-full items-center gap-2 rounded-lg p-2 text-sm h-8
                    // active: bg-sidebar-accent font-medium text-sidebar-accent-foreground
                    className={cn(
                      "flex h-8 w-full items-center gap-2 overflow-hidden rounded-lg p-2 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-ring",
                      active
                        ? "border-sidebar-border/60 bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "border-transparent text-sidebar-foreground opacity-90",
                      item.children && "pr-8",
                      "border",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                  {item.children ? (
                    <>
                      {/* SidebarMenuAction：展开态的子菜单箭头。 Expanded sub-menu chevron. */}
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-1 flex size-5 items-center justify-center text-sidebar-foreground"
                      >
                        <IconChevronRight className="size-4 rotate-90" />
                      </span>
                      {/* SidebarMenuSub + SidebarMenuSubButton */}
                      <ul className="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-sidebar-border border-l px-2.5 pt-1 pb-0.5">
                        {item.children.map((child) => (
                          <li key={child}>
                            <span className="flex h-7 min-w-0 -translate-x-px items-center rounded-lg border border-transparent px-2 text-sidebar-foreground text-sm">
                              <span className="truncate">{child}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

// ─────────────────── Sidebar footer: user section ───────────────────
function SidebarUserSection() {
  // 真实展开态只显示小头像和用户名；工作区切换位于页面标题栏。
  const { recruiter } = getDemoScreenCopy().people;
  return (
    // 真实 SidebarUserSection：px-2 pt-1 pb-1，无分隔线；头像 size="sm"。
    <div className="px-2 pt-1 pb-1">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-[14px] px-1.5 hover:bg-sidebar-accent"
      >
        <Avatar
          label={m.home_frame_candidate_avatar({ name: recruiter })}
          seed="recruiter:misato"
          size="sm"
        >
          <AvatarFallback>{recruiter.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate text-left font-medium text-sm leading-none">
          {recruiter}
        </p>
      </button>
    </div>
  );
}

// ─────────────────── Inset header (top bar) ───────────────────
interface BreadcrumbCrumbBase {
  label: string;
  current?: boolean;
}

export type BreadcrumbCrumb = BreadcrumbCrumbBase;

function BreadcrumbBar({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  // 对齐 shadcn Breadcrumb：text-sm 默认 muted；BreadcrumbPage = font-normal text-foreground
  // 分隔符 ChevronRight size-3.5
  // Mirrors shadcn Breadcrumb: text-sm muted; BreadcrumbPage = font-normal text-foreground
  return (
    <nav
      aria-label={m.home_frame_breadcrumb_aria()}
      className="flex items-center gap-2.5 text-muted-foreground text-sm"
    >
      {crumbs.map((c, i) => (
        <span className="inline-flex items-center gap-2.5" key={c.label}>
          {i > 0 ? <IconChevronRight className="size-3.5" /> : null}
          <span className={c.current ? "font-normal text-foreground" : ""}>{c.label}</span>
        </span>
      ))}
    </nav>
  );
}

function WorkspaceSwitcher() {
  // 真实 WorkspaceSwitcher：Button variant="ghost" size="sm" className="gap-2 font-normal"
  // Real: ghost sm button with gap-2 font-normal + truncated org name + ChevronsUpDown opacity-60
  return (
    <Button variant="ghost" size="sm">
      <span className="truncate">{m.home_frame_workspace()}</span>
      <IconChevronRight className="size-4 rotate-90 opacity-60" />
    </Button>
  );
}

function ThemeToggleButton() {
  // 真实 ThemeToggle 是 Button variant="ghost" size="icon-sm" 内嵌 Sun/Moon
  // Real: ghost icon-sm button with sun/moon swap
  return (
    <Button aria-label={getDemoScreenCopy().shell.themeToggle} variant="ghost" size="icon-sm">
      <IconMoon className="size-4" />
    </Button>
  );
}

function UploadTaskInboxButton() {
  // 真实 UploadTaskInbox 触发器：Button variant="ghost" size="icon-sm" 内嵌 Inbox。
  // Real: ghost icon-sm button with an inbox icon.
  return (
    <Button aria-label={m.home_frame_upload_inbox()} variant="ghost" size="icon-sm">
      <IconInbox className="size-4" />
    </Button>
  );
}

function ActiveMenuIcon({ label }: { label: string }) {
  // 真实桌面端页头用当前菜单图标替代 SidebarTrigger。
  // Desktop header shows the active menu icon in place of SidebarTrigger.
  const Icon = getStudioNavGroups()
    .flatMap((group) => group.items)
    .find((item) => item.label === label)?.icon;
  if (!Icon) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="-ml-1 flex size-7 shrink-0 items-center justify-center text-foreground"
    >
      <Icon className="size-4" />
    </span>
  );
}

interface InsetHeaderProps {
  breadcrumb: BreadcrumbCrumb[];
  actions?: ReactNode;
  className?: string;
}

function InsetHeader({ breadcrumb, actions, className }: InsetHeaderProps) {
  const demo = useOptionalDemo();
  let currentCrumbs = breadcrumb.slice(-1);
  const activePage = demo?.page ?? m.home_frame_nav_recruitment();
  if (demo) {
    const label =
      demo.page === m.home_frame_nav_recruitment() ? m.home_frame_recruitment_desk() : demo.page;
    currentCrumbs = [{ current: true, label }];
  }

  return (
    <header
      // 真实 SidebarInsetHeader: 本体透明，底部叠加两倍 header 高度的渐变层。
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 bg-transparent px-4 after:pointer-events-none after:absolute after:top-0 after:right-0 after:left-0 after:h-24 after:bg-linear-to-b after:from-background after:from-20% after:to-transparent after:content-['']",
        className,
      )}
    >
      <div className="relative z-1 flex min-w-0 items-center gap-2">
        {demo?.candidate ? null : <ActiveMenuIcon label={activePage} />}
        {demo?.candidate ? (
          // 对齐真实详情页：useStudioHeaderOverride 用返回按钮替换面包屑。
          <Button
            className="-ml-1 h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
            data-demo-detail-back
            onClick={() => demo.setCandidate(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconArrowLeft className="size-4" />
            {getDemoScreenCopy().detail.backTo(m.home_frame_recruitment_desk())}
          </Button>
        ) : (
          <BreadcrumbBar crumbs={currentCrumbs} />
        )}
      </div>
      <div className="relative z-1 flex items-center gap-1">
        {actions ?? (
          <>
            <WorkspaceSwitcher />
            <UploadTaskInboxButton />
          </>
        )}
        <ThemeToggleButton />
      </div>
    </header>
  );
}

// ─────────────────── App shell ───────────────────
interface AppShellProps {
  tab?: "agent" | "chat" | "studio";
  sidebar: ReactNode;
  breadcrumb: BreadcrumbCrumb[];
  headerActions?: ReactNode;
  headerClassName?: string;
  // 主体外层 className（默认 bg 与真实 SidebarInset 一致：bg-background）
  // Body wrapper className override.
  bodyClassName?: string;
  // 是否给 body 默认 padding 包装（默认 false——大屏要自己控制）
  // Whether to wrap children in the standard `flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6`
  // page-padding container. Set true to opt-in.
  padded?: boolean;
  children: ReactNode;
}

export function AppShell({
  tab = "studio",
  sidebar,
  breadcrumb,
  headerActions,
  headerClassName,
  bodyClassName,
  padded = false,
  children,
}: AppShellProps) {
  const demo = useOptionalDemo();
  return (
    // 真实外层：has-data-[variant=inset]:bg-sidebar
    // inset 自身是 bg-background，四周露出的底色与 sidebar 保持一致。
    <div
      className="relative flex h-full w-full bg-sidebar text-foreground"
      data-slot="interactive-demo"
    >
      <aside
        inert={Boolean(demo)}
        // 真实 sidebar 外层：p-2 group-data-[collapsible=icon]:w-... 在 inset 变体下；
        // 内层是 bg-sidebar (light) / dark:bg-sidebar 的 sidebar 列。
        // 我们简化为定宽 288px = --sidebar-width。
        // Width: --sidebar-width = calc(0.25rem * 72) = 18rem = 288px
        className={cn(
          "flex w-[288px] shrink-0 flex-col p-2",
          (demo?.phase === "live" || demo?.phase === "human-live") && "hidden",
        )}
      >
        <div className="flex h-full w-full flex-col  text-sidebar-foreground">
          {/* SidebarHeader: gap-3 (AppSidebar override) flex flex-col gap-2 p-2 */}
          <div className="flex shrink-0 flex-col gap-3 p-2">
            <RecruitmentCopilotBrand />
            <SidebarTabs active={tab} />
          </div>
          {/* SidebarContent: flex min-h-0 flex-1 flex-col overflow-hidden */}
          <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
            {sidebar}
          </ScrollArea>
          {/* SidebarFooter: p-0 (AppSidebar override) — user section provides its own border-t */}
          <SidebarUserSection />
        </div>
      </aside>
      {/* SidebarInset: relative flex w-full flex-1 flex-col bg-background
          + variant=inset: m-3 ml-0 rounded-2xl shadow-default；暗色去阴影改 0.5px ring */}
      <section
        inert={Boolean(demo)}
        aria-label={getDemoScreenCopy().shell.workbench}
        className={cn(
          "relative m-3 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-default dark:shadow-none dark:ring-[0.5px] dark:ring-border",
          (demo?.phase === "live" || demo?.phase === "human-live") &&
            "m-0 rounded-none shadow-none dark:ring-0",
        )}
      >
        {demo?.phase === "live" || demo?.phase === "human-live" ? (
          children
        ) : (
          <>
            <InsetHeader
              actions={headerActions}
              breadcrumb={breadcrumb}
              className={headerClassName}
            />
            {/* @container/main min-h-0 flex-1 bg-background (OverlayScrollbars ScrollArea) */}
            <ScrollArea
              scrollbars="leave"
              className={cn("@container/main min-h-0 flex-1 bg-background", bodyClassName)}
            >
              {padded ? <div className="flex flex-col gap-6 px-6 py-6">{children}</div> : children}
            </ScrollArea>
          </>
        )}
      </section>
      {demo && <DemoDialogLayer />}
      {demo && <DemoAutoplay />}
    </div>
  );
}
