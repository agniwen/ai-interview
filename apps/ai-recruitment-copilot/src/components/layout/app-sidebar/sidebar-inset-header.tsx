"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@arc/shared/utils";

interface SidebarInsetHeaderProps {
  // 当前激活菜单的图标。仅桌面端显示，移动端保留 SidebarTrigger。
  // Icon for the active menu item. Desktop only; mobile keeps SidebarTrigger.
  activeMenuIcon?: ReactNode;
  // 左侧面包屑/标题。
  // Left-side breadcrumb / title content.
  breadcrumb?: ReactNode;
  // 右侧扩展槽。追加在 ThemeToggle 之前。
  // Right-side actions rendered before ThemeToggle.
  actions?: ReactNode;
  className?: string;
}

export function SidebarInsetHeader({
  activeMenuIcon,
  breadcrumb,
  actions,
  className,
}: SidebarInsetHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-11 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        // "flex h-(--header-height) shrink-0 bg-sidebar items-center justify-between gap-2 border-border border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 md:hidden" />
        {activeMenuIcon ? (
          <span
            aria-hidden="true"
            className="-ml-1 hidden size-7 shrink-0 items-center justify-center text-foreground md:flex [&>svg]:size-4"
            data-slot="active-menu-icon"
          >
            {activeMenuIcon}
          </span>
        ) : null}
        {breadcrumb ? <>{breadcrumb}</> : null}
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
