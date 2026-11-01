/**
 * 卡片按固定槽位排版（见 studio-list-card-profile），各断点高度按最满内容（评语两行 + 4 条两行要点）推导，
 * 保证卡片底部仍保留 p-4 内边距：
 * - 公共：行内上下 6px×2 + 卡片内边距 16px×2 + 头像行 56 + 行间距 12 + 元信息 24
 *   + 评价区（12 + 评语 38 + 10 + 要点 188）= 384
 * - xl 起：操作按钮与左栏同一行，即公共部分 384
 * - md–lg：额外经历条（12 + 72）与按钮行（12 + 32）→ 512
 * - md 以下：仅额外按钮行（12 + 32）→ 428
 */
const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 428,
  lg: 512,
  md: 512,
  sm: 428,
  xl: 384,
  xxl: 384,
} as const;

export const RESUME_LIBRARY_CARD_SKELETON_ROW_CLASS = "h-[428px] py-1.5 md:h-[512px] xl:h-[384px]";

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
