"use client";

import { m, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@arc/shared/utils";

export const ANIMATED_HEIGHT_COMPLETE_EVENT = "animated-height-complete";

interface AnimatedHeightProps {
  /** 默认在移动端禁用；无 Drawer 手势冲突的页面可显式开启。 */
  animateOnMobile?: boolean;
  children: ReactNode;
  /** false 时保留高度动画，但不裁剪溢出内容，适合父级自己负责滚动的布局。 */
  clip?: boolean;
  /** 默认 240ms ease-in-out，给弹窗 tab 高度切换留一点呼吸感。 */
  duration?: number;
  /** 需要交给父级滚动容器自然撑高时，禁用 height 动画和 overflow 裁剪。 */
  disabled?: boolean;
  /** 自定义 className（一般不需要传）。 */
  className?: string;
  renderContainer?: (props: AnimatedHeightRenderProps) => ReactNode;
}

export interface AnimatedHeightRenderProps {
  children: ReactNode;
  className?: string;
  height: number | "auto";
  innerRef: RefObject<HTMLDivElement | null>;
  onAnimationComplete: () => void;
  style: CSSProperties;
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
export function AnimatedHeight({
  animateOnMobile = false,
  children,
  clip = true,
  disabled = false,
  duration = 0.24,
  className,
  renderContainer,
}: AnimatedHeightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();

  useEffect(() => {
    // 移动端 Modal 会切到 Drawer，自带高度策略与拖拽手势，强行动画反而冲突。
    // 桌面端才需要平滑过渡 tab 切换的高度跳变。
    // Mobile Modal swaps to Drawer with its own sizing/gesture; layering an
    // animation here fights the drawer. Only desktop needs this transition.
    if (disabled || reduceMotion || (isMobile && !animateOnMobile)) {
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
  }, [animateOnMobile, disabled, isMobile, reduceMotion]);

  if (disabled || reduceMotion || (isMobile && !animateOnMobile)) {
    return <div className={className}>{children}</div>;
  }

  const animationStyle = {
    boxSizing: "content-box",
    overflow: clip ? "hidden" : "visible",
  } satisfies CSSProperties;
  const animationComplete = () => {
    containerRef.current?.dispatchEvent(new Event(ANIMATED_HEIGHT_COMPLETE_EVENT));
  };
  if (renderContainer) {
    return renderContainer({
      children: (
        <div ref={innerRef} style={{ display: "flow-root" }}>
          {children}
        </div>
      ),
      className: cn("-m-1 p-1", className),
      height,
      innerRef: containerRef,
      onAnimationComplete: animationComplete,
      style: animationStyle,
    });
  }

  return (
    <m.div
      animate={{ height }}
      className={cn("-m-1 p-1", className)}
      data-slot="animated-height"
      initial={false}
      onAnimationComplete={animationComplete}
      ref={containerRef}
      style={animationStyle}
      transition={{ duration, ease: [0.77, 0, 0.175, 1] as const }}
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
    </m.div>
  );
}
