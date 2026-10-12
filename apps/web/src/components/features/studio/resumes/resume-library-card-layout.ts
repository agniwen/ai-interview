/** 各断点下带评价摘录（评语两行 + 4 条两行要点）卡片的实测最大高度，含底部常驻操作行与行内上下 6px 间距。 */
const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 520,
  lg: 446,
  md: 462,
  sm: 462,
  xl: 416,
  xxl: 416,
} as const;

export const RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS =
  "h-[520px] py-1.5 sm:h-[462px] md:h-[462px] lg:h-[446px] xl:h-[416px] 2xl:h-[416px]";

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
