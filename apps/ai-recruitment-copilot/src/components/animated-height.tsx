"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/shared/utils";

interface AnimatedHeightProps {
  children: ReactNode;
  /** 默认 320ms ease，给弹窗 tab 高度切换留一点呼吸感。 */
  duration?: number;
  /** 自定义 className（一般不需要传）。 */
  className?: string;
}

/**
 * 监测子节点真实高度，用 CSS height 平滑过渡的容器。
 * 比 motion 的 `layout` 更可靠，因为它依赖 ResizeObserver + 显式 animate({ height })，
 * 不受 flex 容器、overflow:hidden、Radix 子树 unmount/remount 等影响。
 *
 * Resize-aware container that smoothly animates its height to match its
 * children's measured size. More reliable than `motion.div layout` here
 * because it leans on `ResizeObserver` + explicit `animate({ height })`,
 * sidestepping flex sizing, scroll containers, and Radix sub-tree
 * unmount/remount that can defeat FLIP-based layout animations.
 */
export function AnimatedHeight({ children, duration = 0.32, className }: AnimatedHeightProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();

  useEffect(() => {
    // 移动端 Modal 会切到 Drawer，自带高度策略与拖拽手势，强行动画反而冲突。
    // 桌面端才需要平滑过渡 tab 切换的高度跳变。
    // Mobile Modal swaps to Drawer with its own sizing/gesture; layering an
    // animation here fights the drawer. Only desktop needs this transition.
    if (isMobile) {
      return;
    }
    const el = innerRef.current;
    if (!el) {
      return;
    }
    // ResizeObserver fires once on observe with the current size, so we
    // get the initial measurement for free (no useLayoutEffect needed).
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  if (isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      animate={{ height }}
      className={cn("-m-1 p-1", className)}
      initial={false}
      style={{ boxSizing: "content-box", overflow: "hidden" }}
      transition={reduceMotion ? { duration: 0 } : { duration, ease: [0.32, 0.72, 0, 1] as const }}
    >
      {/*
        `display: flow-root` 让 inner 自己开 BFC，否则子节点的 top/bottom margin
        会"边距坍塌"穿过 inner 边界——ResizeObserver 测到的 contentRect 不含这部分
        margin，结果是被测高度比真实占位小，外层 motion.div 把底部 margin 跨度的
        内容用 overflow:hidden 裁掉、Modal body 也察觉不到溢出无法滚动。
        `flow-root` opens a BFC on the inner div so child margins are contained;
        otherwise top/bottom margins escape past its content-box, the
        ResizeObserver reports a height short by those margins, and the outer
        motion.div ends up clipping the trailing content while the Modal body
        never realises it should scroll.

        The outer motion.div also keeps a 4px gutter inside its clipping area.
        Form controls render focus rings as box-shadow, which is visual overflow
        and not part of ResizeObserver's measured size. Without this gutter,
        inputs that fill the animated container can have their ring/shadow cut
        off by overflow:hidden during focus.
      */}
      <div ref={innerRef} style={{ display: "flow-root" }}>
        {children}
      </div>
    </motion.div>
  );
}
