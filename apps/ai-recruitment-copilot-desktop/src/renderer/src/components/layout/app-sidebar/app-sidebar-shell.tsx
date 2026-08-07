import type { CSSProperties, ReactNode } from "react";
import { ContentTitleBar } from "@/components/layout/content-title-bar";
import { DesktopChromeBar } from "@/components/layout/desktop-chrome-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "./portals";

const sidebarStyle = {
  "--sidebar-width": "17rem",
  "--sidebar-width-icon": "3rem",
} as CSSProperties;

/**
 * Cursor-style shell:
 *   fixed DesktopChromeBar (toggle / history / settings / drag holes)
 *   [ Sidebar spacer+menu | Content spacer + page ]
 *
 * Controls are always fixed and always mounted — never remounted into the
 * content bar on collapse. Drag only paints empty rectangles under the bar.
 */
export function AppSidebarShell({ children }: { children: ReactNode }) {
  return (
    <SidebarHeaderPortalProvider>
      <SidebarBodyPortalProvider>
        <SidebarFooterPortalProvider>
          <SidebarProvider className="min-h-0 flex-1" style={sidebarStyle}>
            <DesktopChromeBar />
            <AppSidebar />
            <SidebarInset>
              <ContentTitleBar />
              <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
                {children}
              </ScrollArea>
            </SidebarInset>
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
