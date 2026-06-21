"use client";

import type { Transition, Variants } from "motion/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Children, useEffect, useState } from "react";

import { cn } from "@arc/shared/utils";

const defaultVariants: Variants = {
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  initial: { opacity: 0, y: -6 },
};

type MotionElement = typeof motion.p | typeof motion.span | typeof motion.code;

export interface TextFlipProps {
  as?: MotionElement;
  className?: string;
  children: React.ReactNode[];
  interval?: number;
  transition?: Transition;
  variants?: Variants;
  layout?: boolean | "position" | "size" | "preserve-aspect";
  onIndexChange?: (index: number) => void;
}

export function TextFlip({
  as: Component = motion.p,
  className,
  children,
  interval = 2,
  transition = { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
  variants = defaultVariants,
  layout,
  onIndexChange,
}: TextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const items = Children.toArray(children);
  const effectiveVariants = reduceMotion
    ? {
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 0 },
        initial: { opacity: 0, y: 0 },
      }
    : variants;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Component
        key={currentIndex}
        className={cn("inline-block", className)}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={reduceMotion ? { duration: 0 } : transition}
        variants={effectiveVariants}
        layout={layout}
      >
        {items[currentIndex]}
      </Component>
    </AnimatePresence>
  );
}
