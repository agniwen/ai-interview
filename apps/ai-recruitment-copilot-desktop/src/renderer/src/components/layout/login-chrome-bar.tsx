import type { CSSProperties } from "react";
import {
  CHROME_EDGE_PAD_PX,
  CHROME_TRAFFIC_LIGHT_INSET_PX,
  TITLE_BAR_HEIGHT_PX,
  handleTitleBarDoubleClick,
  isMacPlatform,
} from "@/components/layout/chrome";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { WindowControls } from "@/components/window-controls";

const dragStyle = {
  WebkitAppRegion: "drag",
  appRegion: "drag",
} as CSSProperties;

const noDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
} as CSSProperties;

/**
 * Bare top chrome for the login screen: drag + theme toggle + window controls
 * (no sidebar toggle / history). Theme sits where the settings gear is on app chrome.
 */
export function LoginChromeBar(): React.JSX.Element {
  const isMac = isMacPlatform();
  const leftInset = isMac ? CHROME_TRAFFIC_LIGHT_INSET_PX : CHROME_EDGE_PAD_PX;
  // Theme button (~28px) + gap before window controls on Win/Linux.
  const rightControlsPx = CHROME_EDGE_PAD_PX + 28 + (isMac ? 0 : 44 * 3 + 6);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200]"
      onDoubleClick={handleTitleBarDoubleClick}
      style={{ ...noDragStyle, height: TITLE_BAR_HEIGHT_PX }}
    >
      <div
        className="app-drag absolute inset-y-0"
        style={{
          ...dragStyle,
          left: leftInset,
          right: rightControlsPx,
        }}
      />
      <div
        className="app-no-drag absolute inset-y-0 right-0 z-10 flex items-center gap-1.5"
        style={{ ...noDragStyle, paddingRight: CHROME_EDGE_PAD_PX }}
      >
        <ThemeToggle />
        <WindowControls />
      </div>
    </div>
  );
}
