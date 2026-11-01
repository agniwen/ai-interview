import { useSyncExternalStore } from "react";

/**
 * Desktop 招聘台 **fixed** virtual row heights (includes row `pb-3` = 12px).
 *
 * Shorter than web: no checkbox / action rail. Work/education profile is
 * hidden below xl (see card), so base/md only cover meta + summary + skills.
 * xl+ includes the side profile column.
 *
 * Breakpoints follow **viewport** (same as Tailwind on the card).
 */
const RESUME_LIBRARY_CARD_HEIGHTS = {
  /** viewport < 640 — single-col meta, no profile */
  base: 280,
  /** viewport 640–1279 — wrapped meta, compact profile trigger */
  md: 260,
  /** viewport 1280–1535 — profile side-by-side */
  xl: 219,
  /** viewport ≥ 1536 — wrapped meta + side-by-side */
  xxl: 217,
} as const;

function getResumeLibraryCardHeight(viewportWidth: number) {
  if (viewportWidth >= 1536) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xxl;
  }
  if (viewportWidth >= 1280) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xl;
  }
  if (viewportWidth >= 640) {
    return RESUME_LIBRARY_CARD_HEIGHTS.md;
  }
  return RESUME_LIBRARY_CARD_HEIGHTS.base;
}

const RESUME_LIBRARY_CARD_MEDIA_QUERIES = [640, 1280, 1536].map(
  (width) => `(min-width: ${width}px)`,
);

const subscribeToViewportWidth = (onStoreChange: () => void) => {
  const mediaQueries = RESUME_LIBRARY_CARD_MEDIA_QUERIES.map((query) => window.matchMedia(query));
  for (const mediaQuery of mediaQueries) {
    mediaQuery.addEventListener("change", onStoreChange);
  }
  return () => {
    for (const mediaQuery of mediaQueries) {
      mediaQuery.removeEventListener("change", onStoreChange);
    }
  };
};

const getViewportCardHeight = () => getResumeLibraryCardHeight(window.innerWidth);
const getServerCardHeight = () => RESUME_LIBRARY_CARD_HEIGHTS.md;

export function useResumeLibraryCardHeight() {
  return useSyncExternalStore(subscribeToViewportWidth, getViewportCardHeight, getServerCardHeight);
}
