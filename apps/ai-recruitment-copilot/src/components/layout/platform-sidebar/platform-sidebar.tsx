"use client";

import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "@/components/layout/app-sidebar/portals";
import {
  SidebarBodySkeleton,
  SidebarFooterSkeleton,
  SidebarSlotHydrationFallback,
} from "@/components/layout/app-sidebar/sidebar-slot-skeleton";

type PlatformSidebarProps = ComponentProps<typeof Sidebar>;

export function PlatformSidebar({ ...props }: PlatformSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="gap-3">
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
