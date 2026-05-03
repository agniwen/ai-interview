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
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>();

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
