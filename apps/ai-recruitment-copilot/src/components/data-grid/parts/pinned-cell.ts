// src/components/data-grid/parts/pinned-cell.ts
import type { Cell, Header, RowData } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@arc/shared/utils";
import type { DataGridFeatures } from "../table-features";

/**
 * Compute layout styles for pinned and/or fixed-width columns.
 *
 * Pin-start uses `insetInlineStart: column.getStart('start')`,
 * pin-end uses `insetInlineEnd: column.getAfter('end')` (TanStack Table V9
 * logical pinning).
 *
 * 关键：同时强制设置 `width` / `minWidth` = `column.getSize()`。
 * getStart('start') sums prior pinned-start column sizes; if rendered width
 * diverges from getSize(), sticky offsets drift.
 *
 * Fixed-width columns (`minSize === maxSize`, e.g. actions / select) also get an
 * explicit width lock when unpinned, so they don't absorb leftover table space.
 *
 * z-index layering (works with sticky thead):
 *   - regular body cell: auto (0)
 *   - pinned body cell: 1
 *   - regular thead cell: 2
 *   - pinned thead cell (corner): 3
 */
export function getPinningStyles<TData extends RowData>(
  column:
    | Header<DataGridFeatures, TData, unknown>["column"]
    | Cell<DataGridFeatures, TData, unknown>["column"],
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
    // Logical insets track RTL; LTR maps start→left, end→right.
    insetInlineEnd: isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    insetInlineStart: isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    maxWidth: `${size}px`,
    minWidth: `${size}px`,
    position: isPinned ? "sticky" : undefined,
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
export const PINNED_EDGE_START_BORDER_CLASS =
  "relative border-e-0 before:pointer-events-none before:absolute before:inset-y-0 before:end-0 before:z-[1] before:w-px before:bg-border";

export const PINNED_EDGE_END_BORDER_CLASS =
  "relative before:pointer-events-none before:absolute before:inset-y-0 before:start-0 before:z-[1] before:w-px before:bg-border";

/** @deprecated Use PINNED_EDGE_START_BORDER_CLASS */
export const PINNED_EDGE_LEFT_BORDER_CLASS = PINNED_EDGE_START_BORDER_CLASS;
/** @deprecated Use PINNED_EDGE_END_BORDER_CLASS */
export const PINNED_EDGE_RIGHT_BORDER_CLASS = PINNED_EDGE_END_BORDER_CLASS;

/**
 * Pin-edge columns (without columnOrderingFeature):
 * - start group: last leaf is the inner edge
 * - end group: first leaf is the inner edge
 */
export function getPinnedEdgeSides<TData extends RowData>(
  column:
    | Header<DataGridFeatures, TData, unknown>["column"]
    | Cell<DataGridFeatures, TData, unknown>["column"],
): { isEndEdge: boolean; isStartEdge: boolean } {
  const pin = column.getIsPinned();
  if (pin === "start") {
    const startCols = column.table.getStartLeafColumns();
    const last = startCols.at(-1);
    return { isEndEdge: false, isStartEdge: last?.id === column.id };
  }
  if (pin === "end") {
    const [first] = column.table.getEndLeafColumns();
    return { isEndEdge: first?.id === column.id, isStartEdge: false };
  }
  return { isEndEdge: false, isStartEdge: false };
}

/**
 * Edge divider only when scroll has content under that pin side.
 * At rest, return empty so the table keeps its normal cell borders.
 */
export function getPinnedEdgeClassName(options: {
  isEndEdge: boolean;
  isStartEdge: boolean;
  showEndEdge?: boolean;
  showStartEdge?: boolean;
}): string {
  return cn(
    options.isStartEdge && options.showStartEdge && PINNED_EDGE_START_BORDER_CLASS,
    options.isEndEdge && options.showEndEdge && PINNED_EDGE_END_BORDER_CLASS,
  );
}

export function readHorizontalScrollOverflow(element: HTMLElement): {
  canScrollEnd: boolean;
  canScrollStart: boolean;
} {
  const { clientWidth, scrollLeft, scrollWidth } = element;
  const maxScrollLeft = scrollWidth - clientWidth;
  // Sub-pixel tolerance so near-end scroll doesn't flicker the edge divider.
  const epsilon = 1;

  return {
    canScrollEnd: maxScrollLeft > epsilon && scrollLeft < maxScrollLeft - epsilon,
    canScrollStart: scrollLeft > epsilon,
  };
}
