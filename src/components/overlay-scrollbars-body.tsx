"use client";

import { useOverlayScrollbars } from "overlayscrollbars-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// 首页用 GSAP ScrollSmoother 接管整页滚动，OverlayScrollbars 必须让位
// （二者都想控制 body overflow，并存会冲突）。
// On the homepage, GSAP ScrollSmoother controls page scroll — skip
// OverlayScrollbars there to avoid the body-overflow tug-of-war.
const SMOOTH_SCROLL_PATHS = new Set<string>(["/"]);

export function OverlayScrollbarsBody() {
  const pathname = usePathname();
  const [initialize] = useOverlayScrollbars({
    defer: true,
    options: {
      scrollbars: {
        autoHide: "leave",
        autoHideDelay: 600,
        theme: "os-theme-app",
      },
    },
  });

  useEffect(() => {
    if (SMOOTH_SCROLL_PATHS.has(pathname)) {
      return;
    }
    initialize({
      cancel: { body: false },
      target: document.body,
    });
  }, [initialize, pathname]);

  return null;
}
