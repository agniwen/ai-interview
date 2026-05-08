"use client";

import type { ReactNode } from "react";
import {
  Tooltip as HeroTooltip,
  TooltipContent as HeroTooltipContent,
  TooltipTrigger as HeroTooltipTrigger,
} from "@heroui/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type TooltipProps = AnyProps & {
  delayDuration?: number;
  children?: ReactNode;
};
export function Tooltip({ delayDuration: _delayDuration, ...props }: TooltipProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroTooltip {...(props as any)} />;
}

export type TooltipTriggerProps = AnyProps & { asChild?: boolean; children?: ReactNode };
export function TooltipTrigger({ asChild: _asChild, ...props }: TooltipTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroTooltipTrigger {...(props as any)} />;
}

export type TooltipContentProps = AnyProps & {
  side?: string;
  sideOffset?: number;
  children?: ReactNode;
  className?: string;
};
export function TooltipContent({ side, sideOffset, ...props }: TooltipContentProps) {
  return (
    <HeroTooltipContent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      placement={side as never}
      offset={sideOffset}
    />
  );
}

/** Hero UI v3 doesn't need a global TooltipProvider — passthrough stub. */
export function TooltipProvider({ children }: { children: ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}
