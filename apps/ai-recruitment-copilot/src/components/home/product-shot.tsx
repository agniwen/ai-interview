// 用途：Hero 下方的产品主截图大图，滚动驱动轻微缩小
// Purpose: Hero shot of the primary product surface; subtle scroll-driven scale-down.
"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { ResumesScreen } from "@/components/screens";
import { Section } from "./section";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// 顶部小 padding 让截图露出首屏一半，底部沿用 Section 默认节奏与下方 section 对齐
// Small top keeps the screenshot peeking above the fold; default bottom keeps section rhythm consistent.
export function ProductShot() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ScrollSmoother + ScrollTrigger 是同源整合，**不要**手动 scrollerProxy 也不要传
  // scroller —— 那是给第三方 smooth scroller 用的。useGSAP 的 scope 把所有动画挂到
  // wrapperRef 上，unmount 时自动 revert。
  // ScrollSmoother + ScrollTrigger are first-party — no scrollerProxy and no `scroller`
  // option needed (those are for third-party smooth scrollers). useGSAP's scope binds
  // the animation to wrapperRef and reverts automatically on unmount.
  useGSAP(
    () => {
      if (typeof window === "undefined") {
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
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
            scrub: 0.4,
            // 进入屏幕中部就开始缩小，到完全滚出时缩到最小
            // Begins shrinking once image top crosses viewport center; fully shrunk when scrolled out
            start: "top center",
            trigger: target,
          },
        },
      );
    },
    { scope: wrapperRef },
  );

  return (
    <Section className="!pt-8 sm:!pt-10" width="wide">
      <FadeContent>
        <div ref={wrapperRef}>
          <ResumesScreen />
        </div>
      </FadeContent>
    </Section>
  );
}
