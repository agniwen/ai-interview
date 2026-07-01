"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@arc/shared/utils";

interface SidebarInsetHeaderProps {
  // 左侧面包屑/标题。
  // Left-side breadcrumb / title content.
  breadcrumb?: ReactNode;
  // 右侧扩展槽。追加在 ThemeToggle 之前。
  // Right-side actions rendered before ThemeToggle.
  actions?: ReactNode;
  className?: string;
}

export function SidebarInsetHeader({ breadcrumb, actions, className }: SidebarInsetHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-11 flex h-(--header-height) w-full shrink-0 items-center justify-between gap-2 bg-background/60 px-4 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        // "flex h-(--header-height) shrink-0 bg-sidebar items-center justify-between gap-2 border-border border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        {breadcrumb ? <>{breadcrumb}</> : null}
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
