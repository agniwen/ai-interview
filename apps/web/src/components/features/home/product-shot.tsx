// 用途：Hero 下方的产品主截图大图，滚动驱动轻微缩小
// Purpose: Hero shot of the primary product surface; subtle native scroll-driven scale-down.
"use client";

import { m, useReducedMotion } from "motion/react";
import { ResumesScreen } from "@/components/features/home/screens/resumes-screen";
import { Section } from "./section";

const PRODUCT_SHOT_HIDDEN = { opacity: 0, transform: "translateY(16px)" } as const;
const PRODUCT_SHOT_VISIBLE = { opacity: 1, transform: "translateY(0px)" } as const;
const PRODUCT_SHOT_TRANSITION = {
  duration: 0.55,
  ease: [0.23, 1, 0.32, 1],
} as const;

// 顶部小 padding 让截图露出首屏一半，底部沿用 Section 默认节奏与下方 section 对齐
// Small top keeps the screenshot peeking above the fold; default bottom keeps section rhythm consistent.
export function ProductShot() {
  const reducedMotion = useReducedMotion();

  return (
    <Section className="!pt-16 sm:!pt-20 lg:!pt-24" width="wide">
      <m.div
        animate={PRODUCT_SHOT_VISIBLE}
        className="home-product-shot-enter"
        initial={PRODUCT_SHOT_HIDDEN}
        transition={reducedMotion ? { duration: 0 } : PRODUCT_SHOT_TRANSITION}
      >
        <div
          aria-hidden="true"
          className="home-product-shot-scroll mx-auto w-full max-w-6xl drop-shadow-[0_28px_48px_rgba(61,78,113,0.16)] dark:drop-shadow-[0_30px_52px_rgba(0,0,0,0.36)]"
          inert
        >
          <ResumesScreen />
        </div>
      </m.div>
    </Section>
  );
}
