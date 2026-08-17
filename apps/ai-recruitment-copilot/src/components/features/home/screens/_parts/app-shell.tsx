import {
  IconBuilding,
  IconChevronRight,
  IconClipboardList,
  IconFileText,
  IconLayoutSidebarLeftCollapse,
  IconListCheck,
  IconMessageChatbot,
  IconMoon,
  IconPlus,
  IconRobot,
  IconSelector,
  IconUser,
  IconUserCircle,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
// 用途：复刻真实 Studio 壳（shadcn Sidebar variant="inset"）。所有尺寸严格按真实组件：
// --sidebar-width 18rem (288px) · --header-height 3rem (48px) · SidebarMenuButton h-8
// SidebarGroup p-2 · SidebarGroupLabel h-8 px-2 text-xs/70 · TabsList h-9 p-[3px] bg-muted。
// Purpose: 1:1 mirror of the real Studio sidebar+inset layout. Width / heights /
// classes match the actual shadcn primitives the production app uses.

import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
export const STUDIO_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { icon: IconUsers, label: "招聘" },
      { icon: IconRobot, label: "AI 面试" },
    ],
    label: "工作台",
  },
  {
    items: [
      { icon: IconBuilding, label: "部门管理" },
      { icon: IconUserCircle, label: "AI面试官管理" },
      { icon: IconFileText, label: "岗位设置" },
    ],
    label: "招聘配置",
  },
  {
    items: [
      { icon: IconClipboardList, label: "表单题" },
      { icon: IconListCheck, label: "沟通题" },
    ],
    label: "题库",
  },
  {
    items: [
      { icon: IconUser, label: "个人中心" },
      { icon: IconUserCog, label: "工作区管理" },
      { icon: IconMessageChatbot, label: "上下文设置" },
    ],
    label: "系统配置",
  },
];

// ─────────────────── Tabs (real shadcn Tabs default variant) ───────────────────
interface SidebarTabsProps {
  active: "agent" | "chat" | "studio";
}

function SidebarTabs({ active }: SidebarTabsProps) {
  return (
    // 对齐 Tabs default variant：bg-muted + h-9 + p-[3px] + rounded-lg + 子项 shadow-sm
    // Matches Tabs default variant: bg-muted h-9 p-[3px] rounded-lg; active gets shadow-sm
    <div className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-muted/60 p-[3px] text-muted-foreground">
      {(["agent", "studio"] as const).map((value) => {
        const isActive = value === active;
        return (
          <span
            className={cn(
              "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-medium text-sm transition-all",
              isActive ? "bg-background text-foreground shadow-sm" : "text-foreground/60",
            )}
            key={value}
          >
            {value === "agent" ? "Agent" : "Studio"}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────── Sidebar body: Studio nav ───────────────────
interface StudioNavProps {
  activeLabel: string;
}

export function StudioNav({ activeLabel }: StudioNavProps) {
  return (
    <>
      {STUDIO_NAV_GROUPS.map((group) => (
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
                        ? "bg-background font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground",
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
      <div className="flex w-full min-w-0 flex-col p-2">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <span className="font-medium text-sidebar-foreground/70 text-xs">最近会话</span>
          <span className="grid size-6 place-items-center rounded-md text-sidebar-foreground/60">
            <IconPlus className="size-3.5" />
          </span>
        </div>
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
  // 真实 SidebarUserSection 展开态：border-t + px-2 py-2 包裹；按钮 w-full justify-start gap-2 p-1! rounded-full
  // 内容：Avatar size="default" (size-9) + 姓名/组织 + ChevronsUpDown
  // Real expanded state: border-t wrapper + ghost button (rounded-full p-1 gap-2)
  return (
    <div className="border-border border-t px-2 py-2">
      <div className="flex w-full items-center gap-2">
        <div className="flex w-full items-center gap-2 rounded-full p-1">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/15 to-primary/30 font-medium text-[12px] text-primary/75">
            GJ
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate font-medium text-sm">郭靖</p>
            <p className="truncate text-muted-foreground text-xs">Workspace</p>
          </div>
          <IconSelector className="size-4 shrink-0 text-muted-foreground" />
        </div>
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
      aria-label="breadcrumb"
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
      <span className="truncate">Workspace</span>
      <IconSelector className="size-4 opacity-60" />
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
        {/* Separator: mx-2 h-4 vertical */}
        <span aria-hidden="true" className="mx-2 h-4 w-px bg-border" />
        <BreadcrumbBar crumbs={breadcrumb} />
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
    <div className="flex h-full w-full bg-sidebar/70 text-foreground">
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
      <main className="relative m-3 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-none">
        <InsetHeader actions={headerActions} breadcrumb={breadcrumb} className={headerClassName} />
        {/* @container/main min-h-0 flex-1 bg-background (OverlayScrollbars ScrollArea) */}
        <ScrollArea className={cn("@container/main min-h-0 flex-1 bg-background", bodyClassName)}>
          {padded ? <div className="flex flex-col gap-6 px-6 py-6">{children}</div> : children}
        </ScrollArea>
      </main>
    </div>
  );
}
