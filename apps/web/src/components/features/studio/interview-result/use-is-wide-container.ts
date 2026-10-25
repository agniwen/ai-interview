import { useCallback, useState } from "react";

/**
 * 监听容器宽度是否达到阈值。回调 ref 在提交阶段同步测量一次，避免首帧先按窄布局渲染再跳变。
 * Tracks whether a container reaches a width threshold. The callback ref measures once during
 * commit so the first paint already uses the right layout.
 */
export function useIsWideContainer(minWidth: number) {
  const [isWide, setIsWide] = useState(false);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        return;
      }
      const update = () => setIsWide(node.clientWidth >= minWidth);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [minWidth],
  );
  return [ref, isWide] as const;
}
