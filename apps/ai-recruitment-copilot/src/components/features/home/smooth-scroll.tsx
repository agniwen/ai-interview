"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ReactNode } from "react";
import { useRef } from "react";

const DESKTOP_SMOOTH_SCROLL_QUERY =
  "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

interface HomeSmoothScrollMatchMedia {
  add: (query: string, setup: () => (() => void) | undefined) => void;
  revert: () => void;
}

export interface HomeSmoothScrollDependencies {
  createMatchMedia: () => HomeSmoothScrollMatchMedia;
  createSmoother: (options: Parameters<typeof ScrollSmoother.create>[0]) => { kill: () => void };
  refreshTriggers: () => void;
}

const defaultHomeSmoothScrollDependencies: HomeSmoothScrollDependencies = {
  createMatchMedia: gsap.matchMedia,
  createSmoother: ScrollSmoother.create,
  refreshTriggers: ScrollTrigger.refresh,
};

export function HomeSmoothScroll({
  children,
  dependencies = defaultHomeSmoothScrollDependencies,
}: {
  children: ReactNode;
  dependencies?: HomeSmoothScrollDependencies;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);
    const media = dependencies.createMatchMedia();

    media.add(DESKTOP_SMOOTH_SCROLL_QUERY, () => {
      const wrapper = wrapperRef.current;
      const content = contentRef.current;
      if (!(wrapper && content)) {
        return;
      }

      const smoother = dependencies.createSmoother({
        content,
        onFocusIn: () => {
          const target = document.activeElement;
          if (target && !content.contains(target)) {
            return false;
          }
        },
        smooth: 0.8,
        smoothTouch: 0,
        wrapper,
      });

      // ProductShot 等子组件先于父组件完成 layout effect；创建 smoother 后
      // 重新测量其 ScrollTrigger，避免沿用原生滚动坐标。
      dependencies.refreshTriggers();

      return () => {
        smoother.kill();
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      };
    });

    return () => media.revert();
  }, [dependencies]);

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
