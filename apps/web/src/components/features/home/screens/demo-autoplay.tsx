"use client";

import { memo, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useDemoReset } from "./demo-context";
import { runDemoPlayback, playbackDelay } from "./demo-playback";
import { getDemoTourSteps } from "./demo-tour-steps";

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
    const move = async (selector: string, text: string) => {
      const target = host.querySelector<HTMLElement>(selector);
      if (!target) {
        return false;
      }
      // Scroll only the window's own viewport; never move the visitor's homepage.
      const viewport = target.closest<HTMLElement>("[data-overlayscrollbars-viewport]");
      if (viewport) {
        const visible = viewport.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const scale = visible.width / viewport.offsetWidth;
        if (targetRect.bottom > visible.bottom || targetRect.top < visible.top) {
          viewport.scrollTop += (targetRect.top - visible.top - visible.height / 3) / scale;
        }
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
                cursor.style.transform = "translate3d(1180px, 700px, 0)";
              },
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
        style={{ transform: "translate3d(1180px, 700px, 0)", willChange: "transform" }}
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
          招聘流程自动演示
        </span>
      </div>
    </div>
  );
});
