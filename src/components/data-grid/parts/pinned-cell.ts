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
  options: { isHeader?: boolean } = {},
): CSSProperties {
  const isPinned = column.getIsPinned();

  if (!isPinned) {
    return {};
  }

  const size = column.getSize();

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    minWidth: `${size}px`,
    position: "sticky",
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    top: options.isHeader ? 0 : undefined,
    width: `${size}px`,
    zIndex: options.isHeader ? 3 : 1,
  };
}

/**
 * className for pinned cells/headers — 关键点：
 *   1) `bg-background` 与本项目里 `<Card>` 实际用的 token 一致
 *      (本项目 `Card` 的 className 是 `bg-background` 而非 `bg-surface`)，
 *      用错 token 会在 Card 内出现一条色差明显的"色带"
 *   2) hover/selected 用 `[tbody_tr…]` 作用域到 body，避免 thead 行
 *      hover 时只有固定列变色、其他不变的视觉错位
 *   3) padding 不在这里加，统一交给 DataGrid 顶层
 *
 * 1) Use `bg-background` to match this project's `<Card>` surface — the local
 *    `Card` component is built with `bg-background`, NOT `bg-surface`. Picking the
 *    wrong token shows up as a grey stripe across the pinned column.
 * 2) Hover/selected descendant rules are scoped to `tbody` so they only fire
 *    for body rows — thead pinned cells stay flat alongside non-pinned thead
 *    cells (which can't react to row hover anyway since they're opaque).
 * 3) Padding is intentionally NOT set here — DataGrid sets uniform padding on
 *    every cell so pinned and non-pinned columns line up.
 */
export const PINNED_CELL_CLASS =
  "bg-background transition-colors [tbody_tr:hover_&]:bg-default [tbody_tr[data-state=selected]_&]:bg-default";

/**
 * 表头粘性定位 className：粘在滚动容器顶部，bg 用 `bg-background` 与 Card 一致。
 * Sticky thead className: pins to scroll container top with `bg-background` so the
 * header surface matches the wrapping `<Card>` (which itself is `bg-background`).
 */
export const STICKY_HEADER_CLASS = "sticky top-0 z-2 bg-background";
