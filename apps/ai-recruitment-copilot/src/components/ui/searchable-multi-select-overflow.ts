export interface VisibleSelectedItemCountInput {
  containerWidth: number;
  gap: number;
  itemWidths: number[];
  overflowBadgeWidth: number;
}

function getRequiredWidth({
  count,
  gap,
  itemWidths,
  overflowBadgeWidth,
}: VisibleSelectedItemCountInput & { count: number }) {
  const visibleWidth = itemWidths.slice(0, count).reduce((sum, width) => sum + width, 0);
  const visibleGaps = Math.max(0, count - 1) * gap;
  const hiddenCount = itemWidths.length - count;

  if (hiddenCount <= 0) {
    return visibleWidth + visibleGaps;
  }

  const overflowGap = count > 0 ? gap : 0;
  return visibleWidth + visibleGaps + overflowGap + overflowBadgeWidth;
}

export function getVisibleSelectedItemCount({
  containerWidth,
  gap,
  itemWidths,
  overflowBadgeWidth,
}: VisibleSelectedItemCountInput): number {
  if (containerWidth <= 0 || itemWidths.length === 0) {
    return 0;
  }

  for (let count = itemWidths.length; count > 0; count -= 1) {
    const requiredWidth = getRequiredWidth({
      containerWidth,
      count,
      gap,
      itemWidths,
      overflowBadgeWidth,
    });
    if (requiredWidth <= containerWidth) {
      return count;
    }
  }

  return 0;
}
