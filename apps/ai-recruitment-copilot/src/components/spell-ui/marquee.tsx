"use client";

import { Children, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@arc/shared/utils";

interface MarqueeProps extends HTMLAttributes<HTMLDivElement> {
  duration?: number;
  pauseOnHover?: boolean;
  direction?: "left" | "right" | "up" | "down";
  fade?: boolean;
  fadeAmount?: number;
}

export function Marquee({
  children,
  className,
  duration = 20,
  pauseOnHover = false,
  direction = "left",
  fade = true,
  fadeAmount = 10,
  ...props
}: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  const items = Children.toArray(children);
  const isVertical = direction === "up" || direction === "down";

  const getAnimationName = () => {
    if (isVertical) {
      return direction === "up" ? "spell-marquee-y" : "spell-marquee-y-reverse";
    }
    return direction === "left" ? "spell-marquee-x" : "spell-marquee-x-reverse";
  };
  const animationName = getAnimationName();

  const getMaskImage = () => {
    if (!fade) {
      return;
    }
    const axis = isVertical ? "to bottom" : "to right";
    return `linear-gradient(${axis}, transparent 0%, black ${fadeAmount}%, black ${100 - fadeAmount}%, transparent 100%)`;
  };
  const maskImage = getMaskImage();

  return (
    <>
      <style>{`
        @keyframes spell-marquee-x {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes spell-marquee-x-reverse {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
        @keyframes spell-marquee-y {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
        @keyframes spell-marquee-y-reverse {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0); }
        }
      `}</style>
      <div
        className={cn("flex w-full overflow-hidden py-1", isVertical && "flex-col", className)}
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        ref={containerRef}
        style={{
          WebkitMaskImage: maskImage,
          maskImage,
        }}
        {...props}
      >
        <div
          className={cn("flex shrink-0", isVertical && "flex-col")}
          style={{
            animation: `${animationName} ${duration}s linear infinite`,
            animationPlayState: isPaused ? "paused" : "running",
          }}
        >
          {items.map((item, index) => (
            <div className={cn("flex shrink-0", isVertical && "w-full")} key={`first-${index}`}>
              {item}
            </div>
          ))}
          {items.map((item, index) => (
            <div
              aria-hidden="true"
              className={cn("flex shrink-0", isVertical && "w-full")}
              key={`second-${index}`}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
