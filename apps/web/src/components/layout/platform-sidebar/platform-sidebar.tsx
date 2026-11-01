"use client";

import type { ComponentProps } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
import { RecruitmentCopilotBrand } from "@/components/layout/app-sidebar/recruitment-copilot-brand";

type PlatformSidebarProps = ComponentProps<typeof Sidebar>;

export function PlatformSidebar({ ...props }: PlatformSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="relative gap-3 overflow-x-clip">
        <div className="relative h-8 shrink-0">
          <RecruitmentCopilotBrand className="h-8 w-[calc(var(--sidebar-width)-5rem)] transition-opacity duration-150 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none" />
          <SidebarTrigger className="absolute top-0 right-0 size-8" />
        </div>
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
      <SidebarRail />
    </Sidebar>
  );
}
