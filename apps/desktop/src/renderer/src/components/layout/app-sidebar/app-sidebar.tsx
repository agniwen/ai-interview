import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "./portals";
import { SidebarDragRegion } from "./sidebar-drag-region";

type AppSidebarProps = ComponentProps<typeof Sidebar>;

/**
 * Physical sidebar chrome. Header / body / footer contents are injected by
 * pages via Magic Portal. The top drag strip holds the expand/collapse toggle
 * (and history nav); there is no edge rail — Cursor-style.
 */
export function AppSidebar({ ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarDragRegion />
      <SidebarHeader className="relative gap-1 overflow-x-clip pt-0.5">
        <SidebarHeaderPortalTarget className="contents" />
      </SidebarHeader>
      <SidebarContent className="relative overflow-x-hidden">
        <SidebarBodyPortalTarget className="contents" />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <SidebarFooterPortalTarget className="contents" />
      </SidebarFooter>
    </Sidebar>
  );
}
