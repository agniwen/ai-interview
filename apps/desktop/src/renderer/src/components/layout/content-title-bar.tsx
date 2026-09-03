import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";

/**
 * Sticky content-pane gradient, matching Web's two-header-high fade.
 * Sits above the detail overlay without intercepting content interaction.
 * Interactive chrome and product name live in fixed `DesktopChromeBar`.
 */
export function ContentTitleBar(): React.JSX.Element {
  return (
    <header
      aria-hidden="true"
      className="pointer-events-none sticky top-0 z-11 shrink-0 bg-transparent after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-[200%] after:bg-linear-to-b after:from-background after:from-20% after:to-transparent after:content-['']"
      style={{ height: TITLE_BAR_HEIGHT_PX }}
    />
  );
}
