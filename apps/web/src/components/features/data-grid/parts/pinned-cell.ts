import { cn } from "@app/shared/utils";

/**
 * Pin-edge divider — only applied while horizontal scroll has content under the pin.
 * Uses ::before so the line stays with the sticky cell (collapse borders would scroll away).
 * `border-*-0` clears the native cell border on that edge to avoid a double line.
 */
export const PINNED_EDGE_START_BORDER_CLASS =
  "relative border-e-0 before:pointer-events-none before:absolute before:inset-y-0 before:end-0 before:z-[1] before:w-px before:bg-border";

export const PINNED_EDGE_END_BORDER_CLASS =
  "relative before:pointer-events-none before:absolute before:inset-y-0 before:start-0 before:z-[1] before:w-px before:bg-border";

interface HorizontalScrollOverflow {
  canScrollEnd: boolean;
  canScrollStart: boolean;
}

/**
 * Edge divider only when scroll has content under that pin side.
 * At rest, return empty so the table keeps its normal cell borders.
 */
export function getPinnedEdgeClassName(options: {
  isEndEdge: boolean;
  isStartEdge: boolean;
  showEndEdge?: boolean;
  showStartEdge?: boolean;
}): string {
  return cn(
    options.isStartEdge && options.showStartEdge && PINNED_EDGE_START_BORDER_CLASS,
    options.isEndEdge && options.showEndEdge && PINNED_EDGE_END_BORDER_CLASS,
  );
}

export function readHorizontalScrollOverflow(element: HTMLElement): HorizontalScrollOverflow {
  const { clientWidth, scrollLeft, scrollWidth } = element;
  const maxScrollLeft = scrollWidth - clientWidth;
  // Sub-pixel tolerance so near-end scroll doesn't flicker the edge divider.
  const epsilon = 1;

  return {
    canScrollEnd: maxScrollLeft > epsilon && scrollLeft < maxScrollLeft - epsilon,
    canScrollStart: scrollLeft > epsilon,
  };
}
