import { SIDEBAR_DRAG_HEIGHT_PX } from "@/components/layout/chrome";

/**
 * Height spacer only. Window drag + chrome controls live in the fixed
 * `DesktopChromeBar` so expand/collapse never remounts buttons.
 */
export function SidebarDragRegion(): React.JSX.Element {
  return <div aria-hidden="true" className="shrink-0" style={{ height: SIDEBAR_DRAG_HEIGHT_PX }} />;
}
