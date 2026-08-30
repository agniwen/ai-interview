import type { CSSProperties, ReactNode } from "react";
import { ContentTitleBar } from "@/components/layout/content-title-bar";
import { DesktopChromeBar } from "@/components/layout/desktop-chrome-bar";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { DESKTOP_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/resumes/scroll-element";
import {
  StudioContentOverlayProvider,
  StudioContentOverlayTarget,
} from "@/components/features/studio/studio-content-route-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalContent,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "./portals";

interface SidebarStyle extends CSSProperties {
  "--sidebar-width": string;
  "--sidebar-width-icon": string;
}

const sidebarStyle: SidebarStyle = {
  "--sidebar-width": "17rem",
  "--sidebar-width-icon": "3rem",
};

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
              <StudioContentOverlayProvider>
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <ScrollArea
                    className="min-h-0 flex-1 [&_[data-overlayscrollbars-viewport]]:z-auto!"
                    scrollRestorationId={DESKTOP_MAIN_SCROLL_RESTORATION_ID}
                    scrollbars="leave"
                  >
                    <ContentTitleBar />
                    {children}
                  </ScrollArea>
                  <StudioContentOverlayTarget className="pointer-events-none absolute inset-0 z-10" />
                </div>
              </StudioContentOverlayProvider>
            </SidebarInset>
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
