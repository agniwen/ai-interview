// src/components/data-grid/parts/pinned-cell.ts
import type { Cell, Header } from "@tanstack/react-table";
import type { CSSProperties } from "react";

/**
 * Compute sticky positioning for a pinned column.
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
 * Forcing `width` / `minWidth` to `column.getSize()` keeps tanstack's
 * `getStart()` math (which positions subsequent pinned cells) in lockstep
 * with actual rendered width. Without this, padding/content can grow the
 * cell beyond the declared `size`, leaving a gap when scrolling horizontally.
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

  if (!isPinned) {
    return {};
  }

  const size = column.getSize();

  return {
    boxSizing: "border-box",
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    maxWidth: `${size}px`,
    minWidth: `${size}px`,
    position: "sticky",
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    top: options.stickToTop ? 0 : undefined,
    width: `${size}px`,
    zIndex: options.isHeader ? 3 : 1,
  };
}

/**
 * className for pinned body cells. Pinned cells need an opaque base because
 * they sit above horizontally-scrolled content, then mirror the row hover and
 * selected states from the table primitives.
 */
export const PINNED_CELL_CLASS =
  "bg-background transition-colors group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted";

export const PINNED_HEADER_CLASS = "bg-muted";

/**
 * Sticky header cells use the same muted surface as the AlignUI-style header.
 */
export const STICKY_HEADER_CLASS = "sticky top-0 z-2 bg-muted";
