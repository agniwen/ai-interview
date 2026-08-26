export const STUDIO_MAIN_SCROLL_RESTORATION_ID = "studio-main-scroll";

export function getStudioMainScrollToTopElement(): HTMLElement | undefined {
  return (
    document.querySelector<HTMLElement>(
      `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
    ) ?? undefined
  );
}
