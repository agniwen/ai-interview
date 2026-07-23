"use client";

import { IconArrowUp } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";

const SHOW_AFTER_PX = 320;

const FADE_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

function findStudioScrollElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
  );
}

export function StudioScrollToTopButton({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    const selectViewport = () => {
      const viewport = findStudioScrollElement();
      if (!viewport) {
        return false;
      }
      setScrollElement(viewport);
      observer?.disconnect();
      return true;
    };

    if (selectViewport()) {
      return;
    }

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(selectViewport);
      observer.observe(document.body, {
        attributeFilter: ["data-scroll-restoration-id"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!scrollElement) {
      return;
    }

    const onScroll = () => {
      setVisible(scrollElement.scrollTop > SHOW_AFTER_PX);
    };
    onScroll();
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", onScroll);
  }, [scrollElement]);

  return (
    <motion.div
      animate={{
        opacity: visible ? 1 : 0,
        scale: reduceMotion ? 1 : (visible ? 1 : 0.96),
      }}
      aria-hidden={!visible}
      className={cn(
        // 与 inset 外框 m-3 对齐：视口偏移略大于 m-3，右/底保持一致。
        "fixed right-3 bottom-3 z-30 md:right-5 md:bottom-5",
        visible ? "pointer-events-auto" : "pointer-events-none",
        className,
      )}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : FADE_TRANSITION}
    >
      <Button
        aria-label="返回顶部"
        disabled={!visible}
        onClick={() => {
          scrollElement?.scrollTo({
            behavior: reduceMotion ? "auto" : "smooth",
            top: 0,
          });
        }}
        size="icon"
        tabIndex={visible ? 0 : -1}
        title="返回顶部"
        type="button"
        variant="ghost"
      >
        <IconArrowUp />
      </Button>
    </motion.div>
  );
}
