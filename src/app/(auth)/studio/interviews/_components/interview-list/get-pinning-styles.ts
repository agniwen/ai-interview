import type { Cell, Header } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import type { StudioInterviewListRecord } from "@/lib/studio-interviews";

/**
 * 给"被钉住"的表格列计算 sticky 定位样式。
 * Compute the sticky positioning style for a pinned table column.
 *
 * 钉左边：用 `left: column.getStart('left')`；钉右边：用 `right: column.getAfter('right')`。
 * Pin-left uses `left: column.getStart('left')`; pin-right uses `right: column.getAfter('right')`.
 */
export function getPinningStyles(
  column:
    | Header<StudioInterviewListRecord, unknown>["column"]
    | Cell<StudioInterviewListRecord, unknown>["column"],
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
