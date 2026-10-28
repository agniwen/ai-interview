import { useCallback } from "react";

/** Measure the table below its toolbar, reserving the total-count footer. */
export function useTableViewportHeight(enabled: boolean) {
  return useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !enabled) {
        return;
      }
      const ancestors: HTMLElement[] = [];
      let parent = node.parentElement;
      let scroller: HTMLElement | null = null;
      while (parent) {
        ancestors.push(parent);
        if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) {
          scroller = parent;
          break;
        }
        parent = parent.parentElement;
      }
      const update = () => {
        if (window.innerWidth < 768) {
          node.style.removeProperty("--data-grid-auto-max-height");
          return;
        }
        const { top } = node.getBoundingClientRect();
        const bottom = scroller
          ? scroller.getBoundingClientRect().top + scroller.clientTop + scroller.clientHeight
          : window.innerHeight;
        const padding = ancestors.reduce(
          (sum, ancestor) =>
            sum + (Number.parseFloat(getComputedStyle(ancestor).paddingBottom) || 0),
          0,
        );
        // Normalize outer scrolling so scrolling the page cannot grow the table.
        const scrollOffset = scroller?.scrollTop ?? window.scrollY;
        // 合计栏 48px + 表格外框上下各 1px。 The 48px total footer plus the frame's 1px top and bottom borders.
        const available = Math.floor(bottom - top - scrollOffset - padding - 50);
        node.style.setProperty("--data-grid-auto-max-height", `${Math.max(120, available)}px`);
      };
      update();
      const observer = new ResizeObserver(update);
      for (const ancestor of ancestors) {
        observer.observe(ancestor);
      }
      // Toolbar wrapping moves the table without necessarily resizing its scroll parent.
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node) {
          observer.observe(sibling);
        }
      }
      window.addEventListener("resize", update);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", update);
        node.style.removeProperty("--data-grid-auto-max-height");
      };
    },
    [enabled],
  );
}
