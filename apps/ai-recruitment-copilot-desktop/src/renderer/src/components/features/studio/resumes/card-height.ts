import { useSyncExternalStore } from "react";

/**
 * Virtualized row heights from web resume library (`resume-library-page-model.tsx`).
 * Keep in sync so desktop cards align with web breakpoints.
 */
export const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 564,
  lg: 476,
  md: 504,
  sm: 476,
  xl: 290,
  xxl: 242,
} as const;

export function getResumeLibraryCardHeight(viewportWidth: number) {
  if (viewportWidth >= 1536) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xxl;
  }
  if (viewportWidth >= 1280) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xl;
  }
  if (viewportWidth >= 1024) {
    return RESUME_LIBRARY_CARD_HEIGHTS.lg;
  }
  if (viewportWidth >= 768) {
    return RESUME_LIBRARY_CARD_HEIGHTS.md;
  }
  if (viewportWidth >= 640) {
    return RESUME_LIBRARY_CARD_HEIGHTS.sm;
  }
  return RESUME_LIBRARY_CARD_HEIGHTS.base;
}

const RESUME_LIBRARY_CARD_MEDIA_QUERIES = [640, 768, 1024, 1280, 1536].map(
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
const getServerCardHeight = () => RESUME_LIBRARY_CARD_HEIGHTS.lg;

export function useResumeLibraryCardHeight() {
  return useSyncExternalStore(subscribeToViewportWidth, getViewportCardHeight, getServerCardHeight);
}
