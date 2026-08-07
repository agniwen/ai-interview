import { useEffect } from "react";

/**
 * While a chrome-adjacent popup is open, suspend `-webkit-app-region: drag`
 * on title-bar drag strips so outside clicks reach the renderer and dismiss
 * the popup. Electron otherwise swallows pointer events on drag regions.
 *
 * Ref-counted so multiple open menus can coexist.
 */
const ATTR = "data-chrome-drag-suspend";
const COUNT_ATTR = "data-chrome-drag-suspend-count";

export function useSuspendChromeDrag(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    const root = document.documentElement;
    const prev = Number(root.getAttribute(COUNT_ATTR) ?? "0");
    root.setAttribute(COUNT_ATTR, String(prev + 1));
    root.setAttribute(ATTR, "");

    return () => {
      const next = Math.max(0, Number(root.getAttribute(COUNT_ATTR) ?? "1") - 1);
      if (next === 0) {
        root.removeAttribute(COUNT_ATTR);
        root.removeAttribute(ATTR);
      } else {
        root.setAttribute(COUNT_ATTR, String(next));
      }
    };
  }, [active]);
}
