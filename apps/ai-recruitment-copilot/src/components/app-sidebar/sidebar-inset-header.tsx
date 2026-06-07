"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
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
        "flex h-(--header-height) shrink-0 bg-background items-center justify-between gap-2 border-border border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        // "flex h-(--header-height) shrink-0 bg-sidebar items-center justify-between gap-2 border-border border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        {breadcrumb ? (
          <>
            <Separator className="mx-2 data-[orientation=vertical]:h-4" orientation="vertical" />
            {breadcrumb}
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
