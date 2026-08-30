// 用途：Hero 下方的产品主截图大图，滚动驱动轻微缩小
// Purpose: Hero shot of the primary product surface; subtle scroll-driven scale-down.
"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { m, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { ResumesScreen } from "@/components/features/home/screens";
import { Section } from "./section";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const PRODUCT_SHOT_HIDDEN = { opacity: 0, transform: "translateY(16px)" } as const;
const PRODUCT_SHOT_VISIBLE = { opacity: 1, transform: "translateY(0px)" } as const;
const PRODUCT_SHOT_TRANSITION = {
  duration: 0.55,
  ease: [0.23, 1, 0.32, 1],
} as const;

// 顶部小 padding 让截图露出首屏一半，底部沿用 Section 默认节奏与下方 section 对齐
// Small top keeps the screenshot peeking above the fold; default bottom keeps section rhythm consistent.
export function ProductShot() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // useGSAP 的 scope 把动画挂到 wrapperRef 上，unmount 时自动 revert。
  // useGSAP scopes the animation to wrapperRef and reverts it automatically on unmount.
  useGSAP(
    () => {
      const browserWindow = globalThis.window;
      if (!browserWindow) {
        return;
      }
      if (browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
          scale: 0.96,
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
    <Section className="!pt-16 sm:!pt-20 lg:!pt-24" width="wide">
      <m.div
        animate={PRODUCT_SHOT_VISIBLE}
        className="home-product-shot-enter"
        initial={PRODUCT_SHOT_HIDDEN}
        transition={reducedMotion ? { duration: 0 } : PRODUCT_SHOT_TRANSITION}
      >
        <div
          className="mx-auto w-full max-w-6xl drop-shadow-[0_28px_48px_rgba(61,78,113,0.16)] dark:drop-shadow-[0_30px_52px_rgba(0,0,0,0.36)]"
          ref={wrapperRef}
        >
          <ResumesScreen />
        </div>
      </m.div>
    </Section>
  );
}
