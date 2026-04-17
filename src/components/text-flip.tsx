"use client";

import type { Transition, Variants } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import { Children, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const defaultVariants: Variants = {
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  initial: { opacity: 0, y: -8 },
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
  transition = { duration: 0.3 },
  variants = defaultVariants,
  layout,
  onIndexChange,
}: TextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const items = Children.toArray(children);

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
        transition={transition}
        variants={variants}
        layout={layout}
      >
        {items[currentIndex]}
      </Component>
    </AnimatePresence>
  );
}
