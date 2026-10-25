import { useCallback, useState } from "react";

const MIN_FILL_HEIGHT = 320;

function findScrollParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * 让元素恰好填满最近滚动容器的剩余高度，使容器自身不再滚动、只有元素内部滚动。
 * 没有滚动容器（整页滚动）时返回 null，调用方保持自然流式布局。
 *
 * Sizes an element to exactly fill what is left of its nearest scroll container, so the
 * container stops scrolling and only the element scrolls inside. Returns null when there is
 * no scroll container (whole-page scrolling) so callers keep the natural flow layout.
 */
export function useFillScrollParentHeight(active: boolean) {
  const [height, setHeight] = useState<number | null>(null);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!(node && active)) {
        return;
      }
      const scroller = findScrollParent(node);
      if (!scroller) {
        return;
      }
      const update = () => {
        // 按滚动到顶部时的位置计算，切换页签前的滚动距离不影响结果。
        // Measured as if scrolled to the top, so a prior scroll offset does not skew it.
        const offsetTop =
          node.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        const paddingBottom = Number.parseFloat(getComputedStyle(scroller).paddingBottom);
        const available = scroller.clientHeight - offsetTop - paddingBottom;
        setHeight(Math.max(MIN_FILL_HEIGHT, Math.floor(available)));
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(scroller);
      return () => observer.disconnect();
    },
    [active],
  );
  return [ref, active ? height : null] as const;
}
