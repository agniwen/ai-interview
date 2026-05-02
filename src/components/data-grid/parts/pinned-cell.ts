// src/components/data-grid/parts/pinned-cell.ts
import type { Cell, Header } from "@tanstack/react-table";
import type { CSSProperties } from "react";

/**
 * Compute sticky positioning for a pinned column.
 * Pin-left uses `left: column.getStart('left')`; pin-right uses `right: column.getAfter('right')`.
 */
export function getPinningStyles<TData>(
  column: Header<TData, unknown>["column"] | Cell<TData, unknown>["column"],
): CSSProperties {
  const isPinned = column.getIsPinned();

  if (!isPinned) {
    return {};
  }

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    position: "sticky",
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    zIndex: 2,
  };
}

/**
 * className for pinned cells/headers — matches the rules used in the original
 * interview list (background + hover/selected tinting).
 */
export const PINNED_CELL_CLASS =
  "bg-background px-3! transition-colors [tr:hover_&]:bg-muted [tr[data-state=selected]_&]:bg-muted";
