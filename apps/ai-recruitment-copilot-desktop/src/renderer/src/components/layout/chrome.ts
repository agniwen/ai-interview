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

/** Hit target size for a chrome icon button (matches ChromeIconButton size-7). */
export const CHROME_BTN_PX = 28;

export function handleTitleBarDoubleClick(): void {
  void window.api.window.maximize();
}

export function isMacPlatform(): boolean {
  return window.api.window.platform === "darwin";
}
