import { IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@arc/shared/utils";
import { HistoryNav } from "./history-nav";
import { WindowControls } from "./window-controls";

/**
 * Custom title-bar metrics. Keep macOS `trafficLightPosition` in `window.ts`
 * in sync with TITLE_BAR_HEIGHT_PX (lights are ~12px tall).
 */
export const TITLE_BAR_HEIGHT_PX = 36;

function handleTitleBarDoubleClick(): void {
  void window.api.window.maximize();
}

/** Platform-aware left gutter for the history nav (clears macOS traffic lights). */
function historyNavGutterClass(): string {
  // macOS: traffic lights occupy ~x16-68; 92 gives the arrows a ~24px gap.
  return window.api.window.platform === "darwin" ? "pl-[92px]" : "pl-2";
}

export function TitleBar(): React.JSX.Element {
  return (
    <header
      className="relative z-50 flex shrink-0 items-center border-b border-border bg-background"
      onDoubleClick={handleTitleBarDoubleClick}
      style={{ height: TITLE_BAR_HEIGHT_PX }}
    >
      {/*
        Dedicated drag surface. Child content must not cover this with
        app-no-drag + inset-0, or Electron will refuse to move the window.
      */}
      <div aria-hidden="true" className="app-drag absolute inset-0" />

      {/* Back/forward, right of the macOS traffic lights (Cursor-style). */}
      <div
        className={cn(
          "app-no-drag relative z-20 flex h-full items-center",
          historyNavGutterClass(),
        )}
      >
        <HistoryNav />
      </div>
      {/* Center app title (leaves room for traffic lights / window controls). */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <span className="app-drag pointer-events-auto text-[11px] leading-none font-medium tracking-wide text-muted-foreground">
          ARC Desktop
        </span>
      </div>

      <div className="app-no-drag relative z-20 ml-auto flex h-full items-center justify-end pr-1.5">
        <Link
          aria-label="设置"
          className="flex items-center justify-center p-0.5 text-muted-foreground opacity-80 transition-opacity hover:opacity-100"
          onDoubleClick={(event) => event.stopPropagation()}
          to="/settings"
        >
          <IconSettings className="size-4" stroke={1.75} />
        </Link>
        <WindowControls />
      </div>
    </header>
  );
}
