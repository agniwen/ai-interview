"use client";

import type { ReactNode } from "react";
import type { Variants } from "motion/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const PANEL_OFFSET = 20;

export type SidebarTabValue = "agent" | "studio";
export type SidebarSlotDirection = -1 | 1;

interface SidebarSlotMotionContext {
  direction: SidebarSlotDirection;
  reduceMotion: boolean;
}

export const sidebarSlotPanelVariants = {
  center: {
    opacity: 1,
    transform: "translateX(0px)",
  },
  enter: ({ direction, reduceMotion }: SidebarSlotMotionContext) => ({
    opacity: reduceMotion ? 1 : 0,
    transform: reduceMotion ? "translateX(0px)" : `translateX(${direction * PANEL_OFFSET}px)`,
  }),
  exit: ({ direction, reduceMotion }: SidebarSlotMotionContext) => ({
    opacity: reduceMotion ? 1 : 0,
    transform: reduceMotion ? "translateX(0px)" : `translateX(${-direction * PANEL_OFFSET}px)`,
  }),
} satisfies Variants;

export function resolveSidebarTab(pathname: string): SidebarTabValue | null {
  if (!pathname.startsWith("/w/")) {
    return null;
  }
  if (pathname.includes("/studio")) {
    return "studio";
  }
  if (pathname.includes("/agent") || pathname.includes("/chat")) {
    return "agent";
  }
  return null;
}

export function resolveSidebarSlotDirection(
  previousTab: SidebarTabValue,
  activeTab: SidebarTabValue,
): SidebarSlotDirection {
  return previousTab === "agent" && activeTab === "studio" ? 1 : -1;
}

export function SidebarSlotTransition({
  active,
  children,
  direction,
  panelKey,
}: {
  active: boolean;
  children: ReactNode;
  direction: SidebarSlotDirection;
  panelKey: string;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const motionContext = { direction, reduceMotion } satisfies SidebarSlotMotionContext;

  return (
    <AnimatePresence custom={motionContext} initial={false} mode="popLayout">
      {active ? (
        <motion.div
          animate="center"
          custom={motionContext}
          exit="exit"
          initial="enter"
          key={panelKey}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const }
          }
          variants={sidebarSlotPanelVariants}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
