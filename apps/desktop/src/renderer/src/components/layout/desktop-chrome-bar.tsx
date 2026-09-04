import { useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { MeetingInboxMenu } from "@/components/features/meeting/meeting-inbox-menu";
import { HistoryNav } from "@/components/history-nav";
import { SidebarToggle } from "@/components/layout/app-sidebar/sidebar-toggle";
import {
  CHROME_BTN_PX,
  CHROME_EDGE_PAD_PX,
  desktopChromeRightControlsWidthPx,
  CHROME_TRAFFIC_LIGHT_INSET_PX,
  TITLE_BAR_HEIGHT_PX,
  handleTitleBarDoubleClick,
  isMacPlatform,
} from "@/components/layout/chrome";
import { useSidebar } from "@/components/ui/sidebar";
import { WindowControls } from "@/components/window-controls";

interface ElectronDragStyle extends CSSProperties {
  WebkitAppRegion: "drag";
  appRegion: "drag";
}

interface ElectronNoDragStyle extends CSSProperties {
  WebkitAppRegion: "no-drag";
  appRegion: "no-drag";
}

const dragStyle: ElectronDragStyle = {
  WebkitAppRegion: "drag",
  appRegion: "drag",
};

const noDragStyle: ElectronNoDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
};

/**
 * Single fixed top chrome for the whole window.
 *
 * - Container is **no-drag** so controls always receive clicks in Electron.
 * - Only empty absolute rectangles are `app-drag` (never under buttons).
 * - Toggle / history stay mounted and fixed; history eases between
 *   sidebar-right (expanded) and next-to-toggle (collapsed).
 * - Inbox and native window controls stay on the right of this same bar.
 */
export function DesktopChromeBar(): React.JSX.Element {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const showHistoryNav = useRouterState({
    select: (routerState) => {
      const path = routerState.location.pathname;
      // Hide history on settings + unauthenticated/auth chrome routes.
      if (path.startsWith("/settings") || path.startsWith("/login") || path.startsWith("/auth")) {
        return false;
      }
      return true;
    },
  });
  const isMac = isMacPlatform();
  const leftInset = isMac ? CHROME_TRAFFIC_LIGHT_INSET_PX : CHROME_EDGE_PAD_PX;

  const toggleEnd = leftInset + CHROME_BTN_PX;
  const historyClusterPx = showHistoryNav ? CHROME_BTN_PX * 2 + 2 : 0;
  // Right cluster: inbox + optional native window controls + edge pad.
  const rightClusterPx = desktopChromeRightControlsWidthPx();

  // Expanded: history ends at sidebar right pad.
  // Collapsed: history starts just after the toggle.
  const historyLeft = collapsed
    ? toggleEnd
    : `calc(var(--sidebar-width) - ${CHROME_EDGE_PAD_PX}px)`;

  // Collapsed left controls end (toggle + optional history).
  const collapsedLeftEnd = toggleEnd + historyClusterPx;

  // Expanded: end the in-sidebar drag just before the history cluster.
  // right = 100% - (sidebar-width - pad - historyWidth)
  //       = 100% - sidebar-width + pad + historyWidth
  const expandedSidebarDragRight = `calc(100% - var(--sidebar-width) + ${CHROME_EDGE_PAD_PX + historyClusterPx}px)`;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200]"
      onDoubleClick={handleTitleBarDoubleClick}
      style={{
        ...noDragStyle,
        height: TITLE_BAR_HEIGHT_PX,
      }}
    >
      {/* ── Drag only on empty strips (never under controls) ── */}
      {collapsed ? (
        <div
          className="app-drag absolute inset-y-0"
          style={{
            ...dragStyle,
            left: collapsedLeftEnd,
            right: rightClusterPx,
          }}
        />
      ) : (
        <>
          {/* Sidebar middle (between toggle and history) */}
          <div
            className="app-drag absolute inset-y-0"
            style={{
              ...dragStyle,
              left: toggleEnd,
              right: expandedSidebarDragRight,
            }}
          />
          {/* Content middle (between sidebar edge and right-side controls) */}
          <div
            className="app-drag absolute inset-y-0"
            style={{
              ...dragStyle,
              left: "var(--sidebar-width)",
              right: rightClusterPx,
            }}
          />
        </>
      )}

      {/* ── Controls: always mounted, always no-drag ── */}
      <div
        className="app-no-drag absolute inset-y-0 z-10 flex items-center"
        style={{ ...noDragStyle, left: leftInset }}
      >
        <SidebarToggle />
      </div>

      {showHistoryNav ? (
        <div
          className="app-no-drag absolute inset-y-0 z-10 flex items-center transition-[left,transform] duration-200 ease-[ease] motion-reduce:transition-none"
          style={{
            ...noDragStyle,
            left: historyLeft,
            transform: collapsed ? "none" : "translateX(-100%)",
          }}
        >
          <HistoryNav />
        </div>
      ) : null}

      <div
        className="app-no-drag absolute inset-y-0 right-0 z-10 flex items-center gap-1.5"
        style={{ ...noDragStyle, paddingRight: CHROME_EDGE_PAD_PX }}
      >
        <MeetingInboxMenu />
        <WindowControls />
      </div>
    </div>
  );
}
