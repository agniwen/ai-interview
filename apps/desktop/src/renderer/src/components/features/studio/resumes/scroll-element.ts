import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Matches AppSidebarShell main content ScrollArea `scrollRestorationId`. */
export const DESKTOP_MAIN_SCROLL_RESTORATION_ID = "desktop-main";

export function findDesktopMainScrollElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restoration-id="${DESKTOP_MAIN_SCROLL_RESTORATION_ID}"]`,
  );
}

function findVerticalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    if (parent.classList.contains("os-viewport")) {
      return parent;
    }
    parent = parent.parentElement;
  }
  const { scrollingElement } = document;
  if (scrollingElement === document.documentElement) {
    return document.documentElement;
  }
  return scrollingElement === document.body ? document.body : null;
}

export function useResumeLibraryScrollElement(listRootRef: RefObject<HTMLDivElement | null>) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    const selectDesktopViewport = () => {
      const viewport = findDesktopMainScrollElement();
      if (!viewport) {
        return false;
      }
      setScrollElement(viewport);
      observer?.disconnect();
      return true;
    };

    observer = new MutationObserver(selectDesktopViewport);
    observer.observe(document.body, {
      attributeFilter: ["data-scroll-restoration-id"],
      attributes: true,
      subtree: true,
    });

    const frame = window.requestAnimationFrame(() => {
      if (!selectDesktopViewport()) {
        setScrollElement(findVerticalScrollParent(listRootRef.current));
      }
    });
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [listRootRef]);

  return scrollElement;
}
