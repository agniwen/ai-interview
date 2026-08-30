import {
  IconBuilding,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconClipboardList,
  IconFileText,
  IconLayoutSidebarLeftCollapse,
  IconLayoutGrid,
  IconListCheck,
  IconMailCheck,
  IconMessageChatbot,
  IconMoon,
  IconPlus,
  IconRobot,
  IconShieldCheck,
  IconSquareCheck,
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

import type { ReactNode } from "react";
import { RecruitmentCopilotBrand } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as m from "@/paraglide/messages";
import { cn } from "@arc/shared/utils";

interface NavItem {
  icon: typeof IconRobot;
  label: string;
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
        { icon: IconUsers, label: m.home_frame_nav_recruitment() },
        { icon: IconLayoutGrid, label: m.home_frame_nav_talent_pool() },
        { icon: IconRobot, label: m.home_frame_nav_ai_interview() },
        { icon: IconCalendarEvent, label: m.home_frame_nav_calendar() },
        { icon: IconChartBar, label: m.home_frame_nav_dashboard() },
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
        <TabsTrigger value="agent">Agent</TabsTrigger>
        <TabsTrigger value="studio">Studio</TabsTrigger>
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
              const active = item.label === activeLabel;
              return (
                <li className="relative" key={item.label}>
                  <div
                    // SidebarMenuButton default: flex w-full items-center gap-2 rounded-md p-2 text-sm h-8
                    // active: bg-sidebar-accent font-medium text-sidebar-accent-foreground
                    className={cn(
                      "flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm",
                      active
                        ? "border-sidebar-border/80 bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "border-transparent text-sidebar-foreground opacity-90",
                      "border",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

// ─────────────────── Sidebar body: Chat conversation list ───────────────────
interface ChatConversation {
  title: string;
  active?: boolean;
  hint?: string;
}

const CHAT_CONVERSATIONS: ChatConversation[] = [
  { active: true, hint: "刚刚", title: "资深前端工程师 · 三份简历对比" },
  { hint: "2 小时前", title: "增长产品经理候选人初筛" },
  { hint: "昨天", title: "数据分析师 · 含附件对话" },
  { hint: "昨天", title: "后端架构师评估" },
  { hint: "3 天前", title: "UI 设计师作品评估" },
  { hint: "上周", title: "运营专员经验交叉对比" },
];

export function ChatNav() {
  return (
    <>
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="flex h-9 flex-1 items-center gap-2 rounded-md px-2 text-sidebar-foreground/80">
          <IconPlus className="size-4" />
          <span className="font-medium text-sm">创建对话</span>
        </span>
        <span className="grid size-9 place-items-center rounded-md text-sidebar-foreground/80">
          <IconSquareCheck className="size-4" />
        </span>
      </div>
      <div className="flex w-full min-w-0 flex-col p-2">
        <ul className="flex w-full min-w-0 flex-col gap-0.5">
          {CHAT_CONVERSATIONS.map((c) => (
            <li className="group/conv relative" key={c.title}>
              <div
                className={cn(
                  "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm",
                  c.active
                    ? "bg-background font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{c.title}</div>
                  {c.hint ? (
                    <div className="truncate text-[10.5px] text-sidebar-foreground/55">
                      {c.hint}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ─────────────────── Sidebar footer: user section ───────────────────
function SidebarUserSection() {
  // 真实展开态只显示小头像和用户名；工作区切换位于页面标题栏。
  return (
    <div className="border-border border-t px-2 py-2">
      <div className="flex h-9 w-full items-center gap-2 rounded-lg px-2">
        <Avatar generatedSize={32} label="葛城美里的头像" seed="recruiter:葛城美里">
          <AvatarFallback>葛</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate text-left font-medium text-sm leading-none">
          葛城美里
        </p>
      </div>
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
    <span className="flex h-8 items-center gap-2 rounded-md px-2.5 font-normal text-sm">
      <span className="truncate">{m.home_frame_workspace()}</span>
      <IconChevronRight className="size-4 rotate-90 opacity-60" />
    </span>
  );
}

function ThemeToggleButton() {
  // 真实 ThemeToggle 是 Button variant="ghost" size="icon-sm" 内嵌 Sun/Moon
  // Real: ghost icon-sm button with sun/moon swap
  return (
    <span className="grid size-8 place-items-center rounded-md">
      <IconMoon className="size-4" />
    </span>
  );
}

function SidebarTriggerButton() {
  // 真实 SidebarTrigger 是 Button variant="ghost" size="icon" className="size-7" 内嵌 PanelLeft
  // Real: ghost icon button (size-7) with PanelLeft, inset header gives -ml-1
  return (
    <span className="-ml-1 grid size-7 place-items-center rounded-md text-muted-foreground">
      <IconLayoutSidebarLeftCollapse className="size-4" />
    </span>
  );
}

interface InsetHeaderProps {
  breadcrumb: BreadcrumbCrumb[];
  actions?: ReactNode;
  className?: string;
}

function InsetHeader({ breadcrumb, actions, className }: InsetHeaderProps) {
  return (
    <header
      // 真实 SidebarInsetHeader: 本体透明，底部叠加两倍 header 高度的渐变层。
      className={cn(
        "relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 bg-transparent px-4 after:pointer-events-none after:absolute after:top-0 after:right-0 after:left-0 after:h-24 after:bg-linear-to-b after:from-background after:from-20% after:to-transparent after:content-['']",
        className,
      )}
    >
      <div className="relative z-1 flex min-w-0 items-center gap-2">
        <SidebarTriggerButton />
        <BreadcrumbBar crumbs={breadcrumb.slice(-1)} />
      </div>
      <div className="relative z-1 flex items-center gap-1">
        {actions ?? <WorkspaceSwitcher />}
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
  return (
    // 真实外层：has-data-[variant=inset]:bg-sidebar
    // inset 自身是 bg-background，四周露出的底色与 sidebar 保持一致。
    <div className="flex h-full w-full bg-sidebar text-foreground">
      <aside
        // 真实 sidebar 外层：p-2 group-data-[collapsible=icon]:w-... 在 inset 变体下；
        // 内层是 bg-sidebar (light) / dark:bg-sidebar 的 sidebar 列。
        // 我们简化为定宽 288px = --sidebar-width。
        // Width: --sidebar-width = calc(0.25rem * 72) = 18rem = 288px
        className="flex w-[288px] shrink-0 flex-col p-2"
      >
        <div className="flex h-full w-full flex-col  text-sidebar-foreground">
          {/* SidebarHeader: gap-3 (AppSidebar override) flex flex-col gap-2 p-2 */}
          <div className="flex shrink-0 flex-col gap-3 p-2">
            <RecruitmentCopilotBrand />
            <SidebarTabs active={tab} />
          </div>
          {/* SidebarContent: flex min-h-0 flex-1 flex-col overflow-hidden */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{sidebar}</div>
          {/* SidebarFooter: p-0 (AppSidebar override) — user section provides its own border-t */}
          <SidebarUserSection />
        </div>
      </aside>
      {/* SidebarInset: relative flex w-full flex-1 flex-col bg-background
          + variant=inset: m-3 ml-0 rounded-xl shadow-none
          + layout 上还加了 border border-border */}
      <main className="relative m-3 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <InsetHeader actions={headerActions} breadcrumb={breadcrumb} className={headerClassName} />
        {/* @container/main min-h-0 flex-1 bg-background (OverlayScrollbars ScrollArea) */}
        <ScrollArea className={cn("@container/main min-h-0 flex-1 bg-background", bodyClassName)}>
          {padded ? <div className="flex flex-col gap-6 px-6 py-6">{children}</div> : children}
        </ScrollArea>
      </main>
    </div>
  );
}
