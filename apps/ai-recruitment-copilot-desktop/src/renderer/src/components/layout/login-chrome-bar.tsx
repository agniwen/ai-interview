import type { CSSProperties } from "react";
import {
  CHROME_EDGE_PAD_PX,
  CHROME_TRAFFIC_LIGHT_INSET_PX,
  TITLE_BAR_HEIGHT_PX,
  handleTitleBarDoubleClick,
  isMacPlatform,
} from "@/components/layout/chrome";
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
 * Bare top chrome for the login screen: drag + window controls only
 * (no sidebar toggle / history).
 */
export function LoginChromeBar(): React.JSX.Element {
  const isMac = isMacPlatform();
  const leftInset = isMac ? CHROME_TRAFFIC_LIGHT_INSET_PX : CHROME_EDGE_PAD_PX;

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
          right: isMac ? 0 : 44 * 3 + CHROME_EDGE_PAD_PX,
        }}
      />
      <div
        className="app-no-drag absolute inset-y-0 right-0 z-10 flex items-center"
        style={{ ...noDragStyle, paddingRight: CHROME_EDGE_PAD_PX }}
      >
        <WindowControls />
      </div>
    </div>
  );
}
