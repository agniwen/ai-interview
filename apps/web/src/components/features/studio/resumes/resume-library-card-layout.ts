const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 395,
  lg: 297,
  md: 334,
  sm: 314,
  xl: 219,
  xxl: 217,
} as const;

export const RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS =
  "h-[395px] pb-3 sm:h-[314px] md:h-[334px] lg:h-[297px] xl:h-[219px] 2xl:h-[217px]";

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

export const RESUME_LIBRARY_SERVER_CARD_HEIGHT = RESUME_LIBRARY_CARD_HEIGHTS.lg;
