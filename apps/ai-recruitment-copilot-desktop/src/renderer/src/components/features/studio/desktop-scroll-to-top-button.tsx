import { OverlayScrollbars } from "overlayscrollbars";
import { m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  DESKTOP_MAIN_SCROLL_RESTORATION_ID,
  findDesktopMainScrollElement,
} from "@/components/features/studio/resumes/scroll-element";
import { cn } from "@arc/shared/utils";

const SHOW_AFTER_PX = 320;

/** Dispatched so the virtual list can scrollToOffset(0) in sync with the viewport. */
export const DESKTOP_SCROLL_TO_TOP_EVENT = "desktop-main-scroll-to-top";

const FADE_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

function resolveMainViewport(): HTMLElement | null {
  const marked = findDesktopMainScrollElement();
  if (marked) {
    return marked;
  }

  // Host is the OverlayScrollbars root (`data-slot="scroll-area"` on shell).
  const hosts = document.querySelectorAll<HTMLElement>('[data-slot="scroll-area"]');
  for (const host of hosts) {
    const viewport = OverlayScrollbars(host)?.elements().viewport;
    if (viewport && viewport.dataset.scrollRestorationId === DESKTOP_MAIN_SCROLL_RESTORATION_ID) {
      return viewport;
    }
  }

  // Last resort: first OS viewport under the content inset.
  const inset = document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]');
  const fallback = inset?.querySelector<HTMLElement>(".os-viewport");
  return fallback ?? null;
}

/** Force the shell main scroller to Y=0 (instant + smooth). */
export function scrollDesktopMainToTop(behavior: ScrollBehavior = "smooth") {
  const viewport = resolveMainViewport();
  if (!viewport) {
    return;
  }

  const instance =
    OverlayScrollbars(viewport) ??
    (viewport.parentElement ? OverlayScrollbars(viewport.parentElement) : undefined);
  const target = instance?.elements().viewport ?? viewport;

  // Always write scrollTop — Electron/OS can ignore smooth scrollTo alone.
  target.scrollTop = 0;
  target.scrollLeft = 0;
  try {
    target.scrollTo({ behavior, left: 0, top: 0 });
  } catch {
    target.scrollTo(0, 0);
  }

  window.dispatchEvent(new CustomEvent(DESKTOP_SCROLL_TO_TOP_EVENT));

  // Smooth scroll can stall; snap if still offset after the animation window.
  if (behavior === "smooth") {
    window.setTimeout(() => {
      if (target.scrollTop > 0) {
        target.scrollTop = 0;
      }
    }, 450);
  }
}

export function DesktopScrollToTopButton({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let removeListener: (() => void) | null = null;
    let viewport: HTMLElement | null = null;

    const updateVisible = () => {
      const top = viewport?.scrollTop ?? 0;
      setVisible(top > SHOW_AFTER_PX);
    };

    const bind = (next: HTMLElement) => {
      removeListener?.();
      viewport = next;

      updateVisible();

      const instance =
        OverlayScrollbars(next) ??
        (next.parentElement ? OverlayScrollbars(next.parentElement) : undefined);

      if (instance) {
        removeListener = instance.on({ scroll: updateVisible });
      } else {
        next.addEventListener("scroll", updateVisible, { passive: true });
        removeListener = () => next.removeEventListener("scroll", updateVisible);
      }
    };

    const selectViewport = () => {
      const next = resolveMainViewport();
      if (!next) {
        return false;
      }
      bind(next);
      observer?.disconnect();
      return true;
    };

    const Observer = globalThis.MutationObserver;
    if (!selectViewport() && Observer) {
      observer = new Observer(selectViewport);
      observer.observe(document.body, {
        attributeFilter: ["data-scroll-restoration-id"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      removeListener?.();
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <m.div
      animate={{
        opacity: visible ? 1 : 0,
        scale: reduceMotion || visible ? 1 : 0.96,
      }}
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed right-3 bottom-3 z-50 md:right-5 md:bottom-5",
        visible && "pointer-events-auto",
        className,
      )}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : FADE_TRANSITION}
    >
      <Button
        aria-label="返回顶部"
        className={cn(!visible && "pointer-events-none")}
        onClick={() => {
          scrollDesktopMainToTop(reduceMotion ? "auto" : "smooth");
        }}
        size="icon"
        tabIndex={visible ? 0 : -1}
        title="返回顶部"
        type="button"
        variant="ghost"
      >
        <Icon icon="ph:arrow-up" />
      </Button>
    </m.div>,
    document.body,
  );
}
