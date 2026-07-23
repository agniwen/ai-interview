// src/components/data-grid/parts/pinned-cell.ts
import type { Cell, Header } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@arc/shared/utils";

/**
 * Compute layout styles for pinned and/or fixed-width columns.
 *
 * Pin-left 用 `left: column.getStart('left')`，pin-right 用 `right: column.getAfter('right')`。
 *
 * 关键：同时强制设置 `width` / `minWidth` = `column.getSize()`。
 * tanstack 的 `getStart('left')` 是对前面所有 pinned-left 列 `getSize()` 求和，
 * 如果实际渲染宽度（由 padding + 内容决定）跟 `getSize()` 不一致，
 * 后续固定列的 `left:` 偏移就会和视觉边界错开 4-Npx，
 * 横向滚动时表现为"列与列之间有余量/重叠"。
 *
 * 把宽度从 CSS 这边钉死成 `getSize()`，让数学恒等于布局。
 *
 * Fixed-width columns (`minSize === maxSize`, e.g. actions / select) also get an
 * explicit width lock when unpinned, so they don't absorb leftover table space.
 *
 * z-index 分层（与 sticky 表头协作）/ z-index layering (works with sticky thead):
 *   - 普通 body 单元格 / regular body cell:  auto (0)
 *   - 固定 body 单元格 / pinned body cell:    1
 *   - 普通 header 单元格 / regular thead cell: 2
 *   - 固定 header 单元格(交叉处) / pinned thead cell (corner): 3
 */
export function getPinningStyles<TData>(
  column: Header<TData, unknown>["column"] | Cell<TData, unknown>["column"],
  options: { isHeader?: boolean; stickToTop?: boolean } = {},
): CSSProperties {
  const isPinned = column.getIsPinned();
  const { maxSize, minSize } = column.columnDef;
  const isFixedWidth =
    typeof minSize === "number" && typeof maxSize === "number" && minSize === maxSize;

  if (!(isPinned || isFixedWidth)) {
    return {};
  }

  const size = column.getSize();
  let zIndex: number | undefined;
  if (isPinned) {
    zIndex = options.isHeader ? 3 : 1;
  }

  return {
    boxSizing: "border-box",
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    maxWidth: `${size}px`,
    minWidth: `${size}px`,
    position: isPinned ? "sticky" : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    top: isPinned && options.stickToTop ? 0 : undefined,
    width: `${size}px`,
    zIndex,
  };
}

const OPAQUE_HEADER_SURFACE = "bg-sidebar dark:bg-muted";

export const PINNED_HEADER_CLASS = OPAQUE_HEADER_SURFACE;

/**
 * Opaque resting fill for sticky body cells. Row hover/selected fills come from
 * TableCell `group-hover/row` / `group-data-[state=selected]/row` so the whole
 * row (including pinned columns) shares one background.
 */
export const PINNED_CELL_CLASS = "bg-background";

/**
 * Sticky header cells use the same opaque light-mode sidebar / dark muted fill as TableHead.
 */
export const STICKY_HEADER_CLASS = `sticky top-0 z-2 ${OPAQUE_HEADER_SURFACE}`;

/**
 * Pin-edge divider — only applied while horizontal scroll has content under the pin.
 * Uses ::before so the line stays with the sticky cell (collapse borders would scroll away).
 * `border-*-0` clears the native cell border on that edge to avoid a double line.
 */
export const PINNED_EDGE_LEFT_BORDER_CLASS =
  "relative border-r-0 before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:z-[1] before:w-px before:bg-border";

export const PINNED_EDGE_RIGHT_BORDER_CLASS =
  "relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-px before:bg-border";

export function getPinnedEdgeSides<TData>(
  column: Header<TData, unknown>["column"] | Cell<TData, unknown>["column"],
): { isLeftEdge: boolean; isRightEdge: boolean } {
  return {
    isLeftEdge: column.getIsLastColumn("left"),
    isRightEdge: column.getIsFirstColumn("right"),
  };
}

/**
 * Edge divider only when scroll has content under that pin side.
 * At rest, return empty so the table keeps its normal cell borders.
 */
export function getPinnedEdgeClassName(options: {
  isLeftEdge: boolean;
  isRightEdge: boolean;
  showLeftEdge?: boolean;
  showRightEdge?: boolean;
}): string {
  return cn(
    options.isLeftEdge && options.showLeftEdge && PINNED_EDGE_LEFT_BORDER_CLASS,
    options.isRightEdge && options.showRightEdge && PINNED_EDGE_RIGHT_BORDER_CLASS,
  );
}

export function readHorizontalScrollOverflow(element: HTMLElement): {
  canScrollLeft: boolean;
  canScrollRight: boolean;
} {
  const { clientWidth, scrollLeft, scrollWidth } = element;
  const maxScrollLeft = scrollWidth - clientWidth;
  // Sub-pixel tolerance so near-end scroll doesn't flicker the edge divider.
  const epsilon = 1;

  return {
    canScrollLeft: scrollLeft > epsilon,
    canScrollRight: maxScrollLeft > epsilon && scrollLeft < maxScrollLeft - epsilon,
  };
}
