// 用途：Hero 下方的产品主截图大图，滚动驱动轻微缩小
// Purpose: Hero shot of the primary product surface; subtle scroll-driven scale-down.
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Screenshot } from "./screenshot";
import { Section } from "./section";

// 顶部小 padding 让截图露出首屏一半，底部沿用 Section 默认节奏与下方 section 对齐
// Small top keeps the screenshot peeking above the fold; default bottom keeps section rhythm consistent.
export function ProductShot() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // 整页 OverlayScrollbars 自定义滚动容器
    // Custom OverlayScrollbars viewport as ScrollTrigger scroller
    const viewport = document.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");

    const ctx = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      // 注册 scrollerProxy（与 FeatureBlocks 共享同一 viewport，配置幂等）
      // Register scrollerProxy (idempotent with FeatureBlocks's registration on the same viewport)
      if (viewport) {
        ScrollTrigger.scrollerProxy(viewport, {
          getBoundingClientRect() {
            return {
              height: window.innerHeight,
              left: 0,
              top: 0,
              width: window.innerWidth,
            };
          },
          scrollTop(value) {
            if (value !== undefined) {
              viewport.scrollTop = value;
            }
            return viewport.scrollTop;
          },
        });
        viewport.addEventListener("scroll", () => ScrollTrigger.update(), { passive: true });
      }

      const target = wrapperRef.current;
      if (!target) {
        return;
      }

      gsap.set(target, { transformOrigin: "50% 0%" });

      gsap.fromTo(
        target,
        { scale: 1 },
        {
          ease: "none",
          scale: 0.9,
          scrollTrigger: {
            end: "bottom top",
            invalidateOnRefresh: true,
            scroller: viewport ?? undefined,
            scrub: 0.4,
            // 进入屏幕中部就开始缩小，到完全滚出时缩到最小
            // Begins shrinking once image top crosses viewport center; fully shrunk when scrolled out
            start: "top center",
            trigger: target,
          },
        },
      );
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    <Section className="!pt-8 sm:!pt-10" width="wide">
      <FadeContent>
        <div ref={wrapperRef}>
          <Screenshot
            alt="工作台主界面预览"
            darkSrc="/landing/studio-dark.png"
            height={900}
            lightSrc="/landing/studio-light.png"
            priority
            width={1440}
          />
        </div>
      </FadeContent>
    </Section>
  );
}
