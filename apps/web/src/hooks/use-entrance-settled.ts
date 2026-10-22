import { useEffect, useRef, useState } from "react";

const ENTRANCE_SELECTOR = "[data-entrance]";

function collectEntranceAnimations(root: HTMLElement): Animation[] {
  const targets = [root, ...root.querySelectorAll<HTMLElement>(ENTRANCE_SELECTOR)];
  return targets.flatMap((target) =>
    target.getAnimations().filter((animation) => animation instanceof CSSAnimation),
  );
}

/**
 * 首屏 CSS 入场动画播完后返回 true，调用方据此移除动画类名。
 * 节点被重新插入 DOM（例如 body 上的 OverlayScrollbars 初始化时）会让仍挂着的 CSS 动画重播，
 * 移除后入场只播一次。ref 挂在根元素上，额外的动画元素标记 data-entrance。
 *
 * Returns true once the CSS entrance animations on the ref element and its
 * `data-entrance` descendants finish, so callers can drop the animation classes.
 * Re-inserting nodes (e.g. OverlayScrollbars initializing on body) restarts any
 * CSS animation still attached, so removing them keeps the entrance one-shot.
 */
export function useEntranceSettled<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }

    let active = true;
    const finished = collectEntranceAnimations(root).map((animation) => animation.finished);

    async function settleAfterEntrance() {
      await Promise.allSettled(finished);
      if (active) {
        setSettled(true);
      }
    }

    void settleAfterEntrance();

    return () => {
      active = false;
    };
  }, []);

  return [ref, settled] as const;
}
