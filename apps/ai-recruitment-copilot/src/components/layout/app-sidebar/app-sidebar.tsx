"use client";

import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "./portals";
import {
  SidebarBodySkeleton,
  SidebarFooterSkeleton,
  SidebarSlotHydrationFallback,
} from "./sidebar-slot-skeleton";
import { SidebarTabs } from "./sidebar-tabs";

type AppSidebarProps = ComponentProps<typeof Sidebar>;

export function AppSidebar({ ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="gap-3">
        <SidebarTabs />
        <SidebarHeaderPortalTarget className="contents" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarBodyPortalTarget className="contents" />
        <SidebarSlotHydrationFallback>
          <SidebarBodySkeleton />
        </SidebarSlotHydrationFallback>
      </SidebarContent>
      <SidebarFooter className="p-0">
        <SidebarFooterPortalTarget className="contents" />
        <SidebarSlotHydrationFallback>
          <SidebarFooterSkeleton />
        </SidebarSlotHydrationFallback>
      </SidebarFooter>
    </Sidebar>
  );
}
