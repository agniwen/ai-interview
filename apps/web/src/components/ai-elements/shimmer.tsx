"use client";

import type { CSSProperties, ElementType } from "react";
import { memo, useMemo } from "react";
import { cn } from "@app/shared/utils";

interface TextShimmerStyle extends CSSProperties {
  "--spread": string;
  "--text-shimmer-duration": string;
}

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

function ShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  return (
    <Component
      className={cn(
        "ai-text-shimmer relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]",
        className,
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          "--text-shimmer-duration": `${duration}s`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } satisfies TextShimmerStyle
      }
    >
      {children}
    </Component>
  );
}

export const Shimmer = memo(ShimmerComponent);
