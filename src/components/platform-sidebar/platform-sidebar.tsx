"use client";

import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "@/components/app-sidebar/portals";
import { PlatformLogo } from "./platform-logo";

type PlatformSidebarProps = ComponentProps<typeof Sidebar>;

export function PlatformSidebar({ ...props }: PlatformSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="gap-3">
        <PlatformLogo />
        <SidebarHeaderPortalTarget className="contents" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarBodyPortalTarget className="contents" />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <SidebarFooterPortalTarget className="contents" />
      </SidebarFooter>
    </Sidebar>
  );
}
