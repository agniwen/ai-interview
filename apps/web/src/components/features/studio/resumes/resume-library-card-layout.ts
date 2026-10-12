/** 卡片按固定槽位排版（见 studio-list-card-profile），各断点高度由布局决定，含行内上下 6px 间距。 */
const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 418,
  lg: 502,
  md: 502,
  sm: 418,
  xl: 368,
  xxl: 368,
} as const;

export const RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS = "h-[418px] py-1.5 md:h-[502px] xl:h-[368px]";

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
