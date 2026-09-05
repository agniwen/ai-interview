import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
import { cn } from "@app/shared/utils";

export const CONTENT_TITLE_BAR_REVEAL_SCROLL_PX = 24;

export function shouldShowContentTitleBar(scrollTop: number): boolean {
  return scrollTop > CONTENT_TITLE_BAR_REVEAL_SCROLL_PX;
}

/**
 * Floating content-pane gradient. It overlays page content without reserving layout space.
 * Interactive chrome lives in fixed `DesktopChromeBar`.
 */
export function ContentTitleBar({ visible }: { visible: boolean }): React.JSX.Element {
  return (
    <header
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-11 bg-transparent opacity-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-[200%] after:bg-linear-to-b after:from-background after:from-20% after:to-transparent after:content-['']",
        visible && "opacity-100",
      )}
      data-slot="content-title-bar"
      style={{ height: TITLE_BAR_HEIGHT_PX }}
    />
  );
}
