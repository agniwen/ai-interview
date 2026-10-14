"use client";

import { memo, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useDemoReset } from "./demo-context";
import { runDemoPlayback, playbackDelay } from "./demo-playback";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { getDemoTourSteps } from "./demo-tour-steps";

const CURSOR_START = "translate3d(1100px, 640px, 0)";
const VIEWPORT_SELECTOR = "[data-overlayscrollbars-viewport]";
/** 揭示内容时的阅读速度（画布像素 / 毫秒）与时长边界。 Reveal reading speed and duration bounds. */
const REVEAL_SPEED = 0.32;
const REVEAL_MIN_MS = 700;
/** 光标移动前把目标滚进视口的时长。 Duration for bringing a target into view before the cursor moves. */
const BRING_INTO_VIEW_MS = 650;
const REVEAL_TOP_GAP = 16;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function clampScroll(viewport: HTMLElement, top: number) {
  return Math.min(Math.max(0, top), viewport.scrollHeight - viewport.clientHeight);
}

/** 画布被整体缩放，屏幕像素需换算回视口自身的像素。 The canvas is scaled; convert screen px to viewport px. */
function viewportScale(viewport: HTMLElement) {
  return viewport.getBoundingClientRect().width / viewport.offsetWidth || 1;
}

/** Scoped to the fixed-size canvas. Cursor movement uses WAAPI, never React position state. */
export const DemoAutoplay = memo(function DemoAutoplay() {
  const resetDemo = useDemoReset();
  const reducedMotion = useReducedMotion();
  const overlayRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const cursor = cursorRef.current;
    const ripple = rippleRef.current;
    const caption = captionRef.current;
    const host = overlay?.closest<HTMLElement>('[data-slot="interactive-demo"]');
    if (!overlay || !cursor || !ripple || !caption || !host) {
      return;
    }
    const controller = new AbortController();
    let inView = false;
    let wake: (() => void) | undefined;
    const ready = () => inView && !document.hidden;
    const notify = () => {
      cursor.style.opacity = ready() ? "1" : "0";
      for (const animation of cursor.getAnimations()) {
        if (ready()) {
          animation.play();
        } else {
          animation.pause();
        }
      }
      if (ready()) {
        wake?.();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        notify();
      },
      { threshold: 0.25 },
    );
    observer.observe(host);
    document.addEventListener("visibilitychange", notify);
    const waitForVisibility = async () => {
      if (!ready() && !controller.signal.aborted) {
        const { promise, resolve } = Promise.withResolvers<boolean>();
        const resume = () => {
          controller.signal.removeEventListener("abort", resume);
          wake = undefined;
          resolve(true);
        };
        wake = resume;
        controller.signal.addEventListener("abort", resume, { once: true });
        await promise;
      }
      return !controller.signal.aborted;
    };
    // 只滚动演示窗口内部的视口，从不移动访客的首页。用 rAF 缓动，滚动和光标一样有过程。
    // Only the window's own viewports scroll, never the homepage; rAF easing keeps it gradual.
    const scrollViewport = (viewport: HTMLElement, to: number, duration: number) => {
      const from = viewport.scrollTop;
      const target = clampScroll(viewport, to);
      if (Math.abs(target - from) < 1) {
        return Promise.resolve(true);
      }
      if (reducedMotion) {
        viewport.scrollTop = target;
        return Promise.resolve(true);
      }
      const startedAt = performance.now();
      const { promise, resolve } = Promise.withResolvers<boolean>();
      const frame = (now: number) => {
        if (controller.signal.aborted) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        viewport.scrollTop = from + (target - from) * easeInOutCubic(progress);
        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve(true);
        }
      };
      requestAnimationFrame(frame);
      return promise;
    };
    const bringIntoView = (target: HTMLElement) => {
      const viewport = target.closest<HTMLElement>(VIEWPORT_SELECTOR);
      if (!viewport) {
        return Promise.resolve(true);
      }
      const visible = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (targetRect.bottom <= visible.bottom && targetRect.top >= visible.top) {
        return Promise.resolve(true);
      }
      const offset = (targetRect.top - visible.top - visible.height / 3) / viewportScale(viewport);
      return scrollViewport(viewport, viewport.scrollTop + offset, BRING_INTO_VIEW_MS);
    };
    /** 先把区域顶部带进视口，再按阅读速度往下滚，直到区域底部可见或用完时长。 */
    const reveal = async (selector: string, budget: number) => {
      // 等新内容渲染并完成布局。 Let the revealed content render and lay out first.
      if (!(await playbackDelay(450, controller.signal))) {
        return false;
      }
      const region = host.querySelector<HTMLElement>(selector);
      const viewport = region?.closest<HTMLElement>(VIEWPORT_SELECTOR);
      if (!(region && viewport) || viewport.scrollHeight <= viewport.clientHeight) {
        return true;
      }
      const scale = viewportScale(viewport);
      const visible = viewport.getBoundingClientRect();
      const rect = region.getBoundingClientRect();
      const regionTop = viewport.scrollTop + (rect.top - visible.top) / scale - REVEAL_TOP_GAP;
      const regionEnd =
        viewport.scrollTop + (rect.bottom - visible.bottom) / scale + REVEAL_TOP_GAP;
      const startedAt = performance.now();
      // 区域顶部在视口上方或贴近底部：先较快地把顶部带进来。
      // If the region's top is above the viewport or near its bottom, bring the top in first.
      const topOffscreen = rect.top < visible.top || rect.top > visible.bottom - visible.height / 4;
      if (topOffscreen && !(await scrollViewport(viewport, regionTop, BRING_INTO_VIEW_MS))) {
        return false;
      }
      // 再按阅读速度往下，直到区域底部露出。 Then read downward until the region's bottom shows.
      const target = clampScroll(viewport, regionEnd);
      const distance = target - viewport.scrollTop;
      if (distance < 1) {
        return true;
      }
      const remaining = budget - 450 - (performance.now() - startedAt);
      const duration = Math.max(REVEAL_MIN_MS, Math.min(distance / REVEAL_SPEED, remaining));
      return scrollViewport(viewport, target, duration);
    };
    const move = async (selector: string, text: string) => {
      const target = host.querySelector<HTMLElement>(selector);
      if (!(target && (await bringIntoView(target)))) {
        return false;
      }
      const rect = target.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const scale = bounds.width / host.offsetWidth;
      const x = (rect.left + rect.width / 2 - bounds.left) / scale;
      const y = (rect.top + rect.height / 2 - bounds.top) / scale;
      const transform = `translate3d(${x}px, ${y}px, 0)`;
      caption.textContent = text;
      overlay.dataset.playbackStep = selector;
      const animation = cursor.animate([{ transform: cursor.style.transform }, { transform }], {
        duration: reducedMotion ? 0 : 850,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      });
      try {
        await animation.finished;
      } catch {
        return false;
      }
      if (controller.signal.aborted) {
        return false;
      }
      cursor.style.transform = transform;
      return true;
    };
    const click = (selector: string) => {
      if (!reducedMotion) {
        ripple.animate(
          [
            { opacity: 0.7, transform: "scale(0.3)" },
            { opacity: 0, transform: "scale(1.8)" },
          ],
          { duration: 450, easing: "ease-out" },
        );
      }
      host.querySelector<HTMLElement>(selector)?.click();
    };
    const play = async () => {
      while (!controller.signal.aborted) {
        try {
          await runDemoPlayback(
            {
              click,
              move,
              ready: waitForVisibility,
              reset: () => {
                resetDemo();
                for (const viewport of host.querySelectorAll<HTMLElement>(
                  "[data-overlayscrollbars-viewport]",
                )) {
                  viewport.scrollTop = 0;
                  viewport.scrollLeft = 0;
                }
                cursor.style.transform = CURSOR_START;
              },
              reveal,
            },
            getDemoTourSteps(),
            controller.signal,
          );
        } catch {
          // Restart from the beginning if a target disappeared during a hot update.
        }
        if (!(await playbackDelay(3000, controller.signal))) {
          return;
        }
      }
    };
    play();
    return () => {
      controller.abort();
      observer.disconnect();
      document.removeEventListener("visibilitychange", notify);
      for (const animation of cursor.getAnimations()) {
        animation.cancel();
      }
      for (const animation of ripple.getAnimations()) {
        animation.cancel();
      }
      cursor.style.opacity = "0";
    };
  }, [reducedMotion, resetDemo]);

  return (
    <div
      ref={overlayRef}
      data-slot="demo-autoplay"
      data-playback="playing"
      className="pointer-events-auto absolute inset-0 z-50"
      aria-hidden="true"
    >
      <div
        ref={cursorRef}
        aria-hidden="true"
        className="absolute top-0 left-0 opacity-0"
        style={{ transform: CURSOR_START, willChange: "transform" }}
      >
        <span
          ref={rippleRef}
          className="absolute -top-4 -left-4 size-8 rounded-full border-2 border-primary bg-primary/15 opacity-0"
        />
        <svg
          width="30"
          height="36"
          viewBox="0 0 30 36"
          className="relative drop-shadow-md"
          fill="none"
        >
          <path
            d="M2 2L25 21L14 22L9 32L2 2Z"
            fill="var(--primary)"
            stroke="white"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="absolute top-7 left-5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
          Copilot
        </span>
      </div>
      <div className="absolute right-5 bottom-4 rounded-full border bg-background/95 px-4 py-2 shadow-sm">
        <span ref={captionRef} className="text-xs text-muted-foreground">
          {getDemoScreenCopy().autoplayCaption}
        </span>
      </div>
    </div>
  );
});
