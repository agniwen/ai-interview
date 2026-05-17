// 用途：复刻真实工作台壳 (shadcn Sidebar variant="inset")：外层 bg-sidebar，
// 内置 sidebar 上方 Chat/Studio tabs，底部用户区；右侧主内容是 m-2 ml-0 圆角带边的卡。
// Purpose: mirrors the real Studio shell (shadcn Sidebar variant="inset").
// Outer bg-sidebar; sidebar shows Chat/Studio tabs on top + user section on
// bottom; main content is an `m-2 ml-0 rounded-xl border` inset card.
import {
  BotIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  PanelLeftIcon,
  SettingsIcon,
  UserCircleIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/shared/utils";

interface NavItem {
  icon: typeof BotIcon;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const STUDIO_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { icon: UsersIcon, label: "简历库" },
      { icon: BotIcon, label: "AI 面试" },
    ],
    label: "工作台",
  },
  {
    items: [
      { icon: Building2Icon, label: "部门管理" },
      { icon: UserCircleIcon, label: "面试官管理" },
      { icon: FileTextIcon, label: "在招岗位管理" },
    ],
    label: "招聘配置",
  },
  {
    items: [
      { icon: ClipboardListIcon, label: "面试表单" },
      { icon: ListChecksIcon, label: "面试题" },
    ],
    label: "题库",
  },
  {
    items: [
      { icon: UserIcon, label: "我的信息" },
      { icon: UserCogIcon, label: "工作区管理" },
      { icon: SettingsIcon, label: "系统设置" },
    ],
    label: "系统配置",
  },
];

interface SidebarTabsHeaderProps {
  // 当前激活的 tab；Chat / Studio 二选一
  // Currently active tab (Chat or Studio)
  active: "chat" | "studio";
}

function SidebarTabsHeader({ active }: SidebarTabsHeaderProps) {
  return (
    <div className="px-2 pt-2">
      <div className="flex h-9 w-full items-center rounded-md bg-muted p-1 text-[12px]">
        {(["chat", "studio"] as const).map((value) => {
          const isActive = value === active;
          return (
            <span
              className={cn(
                "flex h-7 flex-1 items-center justify-center rounded-sm font-medium transition-colors",
                isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
              key={value}
            >
              {value === "chat" ? "Chat" : "Studio"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface StudioNavProps {
  activeLabel: string;
}

export function StudioNav({ activeLabel }: StudioNavProps) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden px-2 pt-3">
      {STUDIO_NAV_GROUPS.map((group) => (
        <div className="flex flex-col gap-1" key={group.label}>
          <div className="px-2 py-1 font-medium text-[10px] text-muted-foreground/80 tracking-wide">
            {group.label}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = item.label === activeLabel;
            return (
              <div
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-foreground/80",
                )}
                key={item.label}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface ChatConversation {
  title: string;
  active?: boolean;
}

const CHAT_CONVERSATIONS: ChatConversation[] = [
  { active: true, title: "资深前端工程师 · 三份简历对比" },
  { title: "增长产品经理候选人初筛" },
  { title: "数据分析师 · 含附件对话" },
  { title: "后端架构师评估" },
  { title: "UI 设计师作品评估" },
];

export function ChatNav() {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden px-2 pt-3">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-medium text-[10px] text-muted-foreground/80 tracking-wide">
          最近会话
        </span>
        <span className="text-[10px] text-muted-foreground/60">5</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {CHAT_CONVERSATIONS.map((c) => (
          <div
            className={cn(
              "flex h-8 items-center gap-2 truncate rounded-md px-2 text-[13px]",
              c.active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-foreground/80",
            )}
            key={c.title}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span className="truncate">{c.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarUserFooter() {
  // 复刻 SidebarUserSection 展开态：圆角按钮 + 头像 + 姓名/组织 + 双向箭头
  // Mirrors SidebarUserSection expanded state: rounded button + avatar + name/org + chevrons
  return (
    <div className="border-border/65 border-t px-2 py-2">
      <div className="flex w-full items-center gap-2 rounded-full p-1 text-[12px]">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400/80 to-indigo-500/80 font-medium text-[11px] text-white">
          ZS
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium text-[13px]">张三</div>
          <div className="truncate text-[11px] text-muted-foreground">极光 HR 招聘组</div>
        </div>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

interface InsetHeaderProps {
  breadcrumb: ReactNode;
  // 顶部右侧动作槽（默认渲染 workspace 切换器 + 主题切换按钮）
  // Right-side actions slot. Defaults to workspace switcher + theme toggle.
  actions?: ReactNode;
  className?: string;
}

function ThemeMoonIcon() {
  // 极简版主题按钮图标占位；不引 lucide 避免再增一项依赖
  // Tiny placeholder for the theme toggle button; inlined to avoid an extra import
  return (
    <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function WorkspaceSwitcher() {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] hover:bg-foreground/[0.04]">
      <span className="truncate">极光 HR</span>
      <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
    </span>
  );
}

function InsetHeader({ breadcrumb, actions, className }: InsetHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-2 border-border/60 border-b px-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="-ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
          <PanelLeftIcon className="size-4" strokeWidth={1.75} />
        </span>
        <span className="mx-1 h-4 w-px bg-border/70" />
        {breadcrumb}
      </div>
      <div className="flex items-center gap-1">
        {actions ?? <WorkspaceSwitcher />}
        <span className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
          <ThemeMoonIcon />
        </span>
      </div>
    </header>
  );
}

export interface BreadcrumbCrumb {
  label: string;
  // 最后一段为「当前页」(强调色)；前面的为祖先 (muted)
  // The last crumb is the current page (emphasized); earlier ones are muted ancestors.
  current?: boolean;
}

export function Breadcrumb({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px]">
      {crumbs.map((c, i) => (
        <span className="flex items-center gap-1.5" key={c.label}>
          {i > 0 ? <span className="text-muted-foreground/60">/</span> : null}
          <span className={c.current ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
        </span>
      ))}
    </nav>
  );
}

interface AppShellProps {
  // 顶部 tabs 高亮的 tab（chat / studio）
  // Which top tab is active (chat / studio).
  tab?: "chat" | "studio";
  // 自定义 sidebar 主体 (默认 StudioNav，需要传入 activeLabel)
  // Sidebar body slot. Defaults to StudioNav with activeLabel="简历库" if not provided.
  sidebar: ReactNode;
  // Inset 顶栏的面包屑
  // Breadcrumb shown in the inset header.
  breadcrumb: BreadcrumbCrumb[];
  // 顶栏右侧动作（默认 workspace + 主题切换）
  // Optional override for the right-side actions in the inset header.
  headerActions?: ReactNode;
  // Inset 顶栏自定义 className（覆盖背景毛玻璃等）
  // Override className for the inset header (e.g. translucent background).
  headerClassName?: string;
  // Inset 主体的额外 className（默认带 p-6 滚动容器）
  // Extra className for the inset main body.
  bodyClassName?: string;
  // 主内容
  // Main content
  children: ReactNode;
}

export function AppShell({
  tab = "studio",
  sidebar,
  breadcrumb,
  headerActions,
  headerClassName,
  bodyClassName,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full w-full bg-sidebar text-foreground">
      <aside className="flex w-[228px] shrink-0 flex-col gap-2 py-2">
        <SidebarTabsHeader active={tab} />
        <div className="flex flex-1 flex-col overflow-hidden">{sidebar}</div>
        <SidebarUserFooter />
      </aside>
      <div className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
        <InsetHeader
          actions={headerActions}
          breadcrumb={<Breadcrumb crumbs={breadcrumb} />}
          className={headerClassName}
        />
        <div className={cn("flex-1 overflow-auto bg-sidebar/40 dark:bg-background", bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
