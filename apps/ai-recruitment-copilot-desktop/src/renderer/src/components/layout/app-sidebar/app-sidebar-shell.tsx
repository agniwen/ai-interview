import type { CSSProperties, ReactNode } from "react";
import { ContentTitleBar } from "@/components/layout/content-title-bar";
import { DesktopChromeBar } from "@/components/layout/desktop-chrome-bar";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { DESKTOP_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/resumes/scroll-restore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalContent,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "./portals";

const sidebarStyle = {
  "--sidebar-width": "17rem",
  "--sidebar-width-icon": "3rem",
} as CSSProperties;

/**
 * Always-on sidebar footer (user chip). Lives under SidebarProvider so
 * useSidebar / session hooks work; teleported into AppSidebar footer.
 */
function AuthenticatedSidebarFooter() {
  return (
    <SidebarFooterPortalContent>
      <SidebarUserSection />
    </SidebarFooterPortalContent>
  );
}

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
            <AuthenticatedSidebarFooter />
            <SidebarInset>
              <ContentTitleBar />
              <ScrollArea
                className="min-h-0 flex-1"
                scrollRestorationId={DESKTOP_MAIN_SCROLL_RESTORATION_ID}
                scrollbars="leave"
              >
                {children}
              </ScrollArea>
            </SidebarInset>
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
