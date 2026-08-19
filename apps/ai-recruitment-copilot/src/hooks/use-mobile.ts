import * as React from "react";

/**
 * 视为"移动端"的视口宽度阈值（与 Tailwind `md` 断点对齐）。
 * Viewport-width threshold considered "mobile" — matches Tailwind's `md` breakpoint.
 */
const MOBILE_BREAKPOINT = 768;

/**
 * 响应式判断当前是否是移动端宽度。SSR 阶段返回 `false`，水合后切换到真实值。
 * Reactively report whether the current viewport is mobile-sized. Returns `false`
 * during SSR and updates after hydration.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}
