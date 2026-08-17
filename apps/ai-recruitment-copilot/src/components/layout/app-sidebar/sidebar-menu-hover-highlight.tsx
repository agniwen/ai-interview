"use client";

import { animate, m, useMotionValue, useReducedMotion } from "motion/react";
import { useCallback, useRef } from "react";

const HOVER_TRANSITION = {
  damping: 38,
  mass: 0.45,
  stiffness: 520,
  type: "spring",
} as const;

export function useSidebarMenuHoverHighlight<
  ContainerElement extends HTMLElement = HTMLDivElement,
>() {
  const containerRef = useRef<ContainerElement>(null);
  const reduceMotion = useReducedMotion();
  const height = useMotionValue(0);
  const opacity = useMotionValue(0);
  const width = useMotionValue(0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const moveToMenuItem = useCallback(
    (target: HTMLElement) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextX = targetRect.left - containerRect.left;
      const nextY = targetRect.top - containerRect.top;

      width.set(targetRect.width);
      height.set(targetRect.height);
      if (reduceMotion) {
        x.set(nextX);
        y.set(nextY);
        opacity.set(1);
        return;
      }
      void animate(x, nextX, HOVER_TRANSITION);
      void animate(y, nextY, HOVER_TRANSITION);
      void animate(opacity, 1, { duration: 0.12 });
    },
    [height, opacity, reduceMotion, width, x, y],
  );

  const hideMenuHighlight = useCallback(() => {
    if (reduceMotion) {
      opacity.set(0);
      return;
    }
    void animate(opacity, 0, { duration: 0.1 });
  }, [opacity, reduceMotion]);

  return {
    containerRef,
    hideMenuHighlight,
    hoverHighlight: (
      <m.span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 rounded-md bg-sidebar-accent"
        style={{ height, opacity, width, x, y }}
      />
    ),
    moveToMenuItem,
  };
}
