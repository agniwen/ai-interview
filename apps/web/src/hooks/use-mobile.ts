import * as React from "react";

/** 与 Tailwind md 断点对齐；只在跨越断点时通知组件。 */
const MOBILE_BREAKPOINT = 768;
const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mediaQuery.addEventListener("change", notifyListeners);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", notifyListeners);
      mediaQuery = null;
    }
  };
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

/** SSR 使用桌面快照；水合后同步当前尺寸。所有调用共享一个媒体查询监听。 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
