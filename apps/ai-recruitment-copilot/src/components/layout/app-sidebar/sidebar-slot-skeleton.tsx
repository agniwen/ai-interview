"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";

export function SidebarSlotHydrationFallback({ children }: { children: ReactNode }) {
  const isHydrated = useHydrated();

  if (isHydrated) {
    return null;
  }

  return children;
}

function SidebarSkeletonGroup({ rows }: { rows: number }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <Skeleton className="h-3 w-16" />
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {Array.from({ length: rows }, (_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarBodySkeleton() {
  return (
    <div aria-hidden="true">
      <SidebarSkeletonGroup rows={3} />
      <SidebarSkeletonGroup rows={3} />
      <SidebarSkeletonGroup rows={2} />
    </div>
  );
}

export function SidebarFooterSkeleton() {
  return (
    <div aria-hidden="true" className="border-sidebar-border border-t p-2">
      <div className="flex items-center gap-2 rounded-full p-1">
        <Skeleton className="size-8 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}
