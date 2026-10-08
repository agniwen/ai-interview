"use client";

import { m, useReducedMotion } from "motion/react";
import { ResumesScreen } from "@/components/features/home/screens/resumes-screen";

const PRODUCT_SHOT_HIDDEN = { opacity: 0, transform: "translateY(16px)" } as const;
const PRODUCT_SHOT_VISIBLE = { opacity: 1, transform: "translateY(0px)" } as const;
const PRODUCT_SHOT_TRANSITION = {
  duration: 0.55,
  ease: [0.23, 1, 0.32, 1],
} as const;

export function ProductShot() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="mx-auto w-full max-w-360 px-6 pt-14 pb-14 sm:px-8 sm:pt-16 sm:pb-16 lg:px-12 lg:pt-20 lg:pb-20">
      <m.div
        animate={PRODUCT_SHOT_VISIBLE}
        className="home-product-shot-enter"
        initial={PRODUCT_SHOT_HIDDEN}
        transition={reducedMotion ? { duration: 0 } : PRODUCT_SHOT_TRANSITION}
      >
        <div className="home-product-shot-scroll w-full drop-shadow-[0_24px_40px_rgba(61,78,113,0.12)] dark:drop-shadow-[0_24px_40px_rgba(0,0,0,0.3)]">
          <ResumesScreen />
        </div>
      </m.div>
    </div>
  );
}
