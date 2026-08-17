import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { WorkspaceSelect } from "@/components/features/workspace/workspace-select";
import { MeetingInboxMenu } from "@/components/features/meeting/meeting-inbox-menu";
import { useMeetingCaptureSnapshot } from "@/components/features/meeting/meeting-recording-context";
import { useMeetingLibrary } from "@/components/features/meeting/use-meeting-library";
import {
  contentHeaderTitle,
  parseMeetingSessionId,
} from "@/components/layout/content-header-title";
import { desktopMeetingKeys, fetchMeetingDetail } from "@/lib/client/meetings";
import { HistoryNav } from "@/components/history-nav";
import { SidebarToggle } from "@/components/layout/app-sidebar/sidebar-toggle";
import {
  CHROME_BTN_PX,
  CHROME_EDGE_PAD_PX,
  CHROME_TRAFFIC_LIGHT_INSET_PX,
  TITLE_BAR_HEIGHT_PX,
  handleTitleBarDoubleClick,
  isMacPlatform,
} from "@/components/layout/chrome";
import { chromeIconControlClassName } from "@/components/layout/chrome-icon-button";
import { Icon } from "@/components/ui/icon";
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

/** Compact workspace select in the right chrome cluster (max-w ~10rem + caret). */
const WORKSPACE_SELECT_APPROX_PX = 160;
/** gap-1.5 between right-cluster controls. */
const CHROME_RIGHT_GAP_PX = 6;

/** Approx. Win/Linux window-control cluster (3 × 44px). macOS is 0. */
function windowControlsWidthPx(): number {
  return window.api.window.platform === "darwin" ? 0 : 44 * 3;
}

/**
 * Single fixed top chrome for the whole window.
 *
 * - Container is **no-drag** so controls always receive clicks in Electron.
 * - Only empty absolute rectangles are `app-drag` (never under buttons).
 * - Toggle / history stay mounted and fixed; history eases between
 *   sidebar-right (expanded) and next-to-toggle (collapsed).
 * - Workspace select + settings stay on the right of this same bar.
 */
function isLocalMeetingSession(
  meetingId: string | null,
  snapshot: ReturnType<typeof useMeetingCaptureSnapshot>,
): boolean {
  if (!meetingId) {
    return false;
  }
  return (
    snapshot.active?.captureId === meetingId ||
    snapshot.saved?.captureId === meetingId ||
    snapshot.localSessions.some((session) => session.id === meetingId)
  );
}

function useContentHeaderLabel(): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const meetingId = parseMeetingSessionId(pathname);
  const captureSnapshot = useMeetingCaptureSnapshot();
  const { meetingsQuery, workspace } = useMeetingLibrary();
  const localTitle = captureSnapshot.localSessions.find(
    (session) => session.id === meetingId,
  )?.title;
  const workspaceSlug = workspace?.slug ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(workspace && meetingId && !isLocalMeetingSession(meetingId, captureSnapshot)),
    queryFn: () => fetchMeetingDetail(workspaceSlug, meetingId ?? ""),
    queryKey: desktopMeetingKeys.detail(workspaceSlug, meetingId ?? ""),
    staleTime: 5000,
  });
  const remoteTitle = meetingsQuery.data?.find((meeting) => meeting.id === meetingId)?.title;
  return contentHeaderTitle({
    pathname,
    sessionArchived: detailQuery.data?.archived === true,
    sessionTitle: localTitle ?? remoteTitle ?? detailQuery.data?.title ?? null,
  });
}

export function DesktopChromeBar(): React.JSX.Element {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const headerTitle = useContentHeaderLabel();
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
  // Right cluster: workspace + inbox + settings + window controls + edge pad.
  const settingsClusterPx =
    CHROME_EDGE_PAD_PX +
    WORKSPACE_SELECT_APPROX_PX +
    CHROME_RIGHT_GAP_PX +
    CHROME_BTN_PX +
    CHROME_RIGHT_GAP_PX +
    CHROME_BTN_PX +
    windowControlsWidthPx();

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

  // Product name sits at the left of the content header (after sidebar when
  // expanded; after toggle/history when collapsed).
  const appTitleLeft = collapsed
    ? collapsedLeftEnd + 8
    : `calc(var(--sidebar-width) + ${CHROME_EDGE_PAD_PX}px)`;

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
            right: settingsClusterPx,
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
          {/* Content middle (between sidebar edge and settings) */}
          <div
            className="app-drag absolute inset-y-0"
            style={{
              ...dragStyle,
              left: "var(--sidebar-width)",
              right: settingsClusterPx,
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
          className="app-no-drag absolute inset-y-0 z-10 flex items-center"
          style={{
            ...noDragStyle,
            left: historyLeft,
            transform: collapsed ? "none" : "translateX(-100%)",
            transition: "left 200ms ease, transform 200ms ease",
          }}
        >
          <HistoryNav />
        </div>
      ) : null}

      {/* Content-header product name (visual only — drag strip sits above). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 flex min-w-0 items-center"
        style={{
          left: appTitleLeft,
          right: settingsClusterPx,
          transition: "left 200ms ease",
        }}
      >
        <span className="truncate select-none font-medium text-muted-foreground text-sm tracking-tight">
          {headerTitle}
        </span>
      </div>

      <div
        className="app-no-drag absolute inset-y-0 right-0 z-10 flex items-center gap-1.5"
        style={{ ...noDragStyle, paddingRight: CHROME_EDGE_PAD_PX }}
      >
        <div className="app-no-drag flex items-center" style={noDragStyle}>
          <WorkspaceSelect />
        </div>
        <MeetingInboxMenu />
        <Link
          aria-label="设置"
          className={chromeIconControlClassName}
          onDoubleClick={(event) => event.stopPropagation()}
          style={noDragStyle}
          to="/settings"
        >
          <Icon className="size-4" icon="ph:gear" />
        </Link>
        <WindowControls />
      </div>
    </div>
  );
}
