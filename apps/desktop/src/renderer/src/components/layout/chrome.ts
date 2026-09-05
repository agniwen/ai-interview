/**
 * Shared chrome metrics for the Cursor-style frameless shell.
 * Keep macOS `trafficLightPosition` in `src/main/window.ts` in sync
 * (lights are ~12px tall; y is chosen so their center sits on this band).
 */
export const TITLE_BAR_HEIGHT_PX = 40;

/** Top drag strip on the sidebar (clears traffic lights on macOS). */
export const SIDEBAR_DRAG_HEIGHT_PX = TITLE_BAR_HEIGHT_PX;

/**
 * Left inset for chrome controls after macOS traffic lights.
 * Lights occupy ~x16–68; 82 leaves a comfortable gap before the toggle.
 */
export const CHROME_TRAFFIC_LIGHT_INSET_PX = 82;

/** Horizontal padding used for chrome control clusters (matches pr-3 / pl-3). */
export const CHROME_EDGE_PAD_PX = 12;

/** Hit target size for a chrome icon button (matches ChromeIconButton size-6). */
export const CHROME_BTN_PX = 24;

/** Gap between the inbox and native Win/Linux window controls. */
export const CHROME_RIGHT_GAP_PX = 6;

/** Gap between page-owned title-bar actions and fixed desktop chrome. */
export const CHROME_PAGE_ACTIONS_GAP_PX = 20;

/** Reserved width for two compact page-owned title-bar actions. */
export const CHROME_PAGE_ACTIONS_WIDTH_PX = CHROME_BTN_PX * 2 + 2;

export function isMacPlatform(): boolean {
  return window.api.window.platform === "darwin";
}

/** Width reserved by the fixed right-side chrome controls. */
export function desktopChromeRightControlsWidthPx(): number {
  const windowControlsPx = isMacPlatform() ? 0 : 44 * 3;
  return (
    CHROME_EDGE_PAD_PX +
    CHROME_BTN_PX +
    (windowControlsPx > 0 ? CHROME_RIGHT_GAP_PX : 0) +
    windowControlsPx
  );
}

export function handleTitleBarDoubleClick(): void {
  void window.api.window.maximize();
}
