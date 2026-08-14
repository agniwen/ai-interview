import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";

/**
 * Height spacer + content-pane top border (opaque with the inset).
 * Interactive chrome and product name live in fixed `DesktopChromeBar`.
 */
export function ContentTitleBar(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="shrink-0 border-b border-border bg-background"
      style={{ height: TITLE_BAR_HEIGHT_PX }}
    />
  );
}
