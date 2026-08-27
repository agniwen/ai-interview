"use client";

import { cn } from "@arc/shared/utils";
import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

interface SkeletonRevealProps extends Omit<ComponentProps<"div">, "children" | "ref"> {
  children: ReactNode;
  contentClassName?: string;
  layout?: "fixed" | "flow";
  loading: boolean;
  skeleton: ReactNode;
  skeletonClassName?: string;
}

function SkeletonReveal({
  children,
  className,
  contentClassName,
  layout = "flow",
  loading,
  skeleton,
  skeletonClassName,
  ...props
}: SkeletonRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const shouldRenderSkeleton = loading || showSkeleton;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const placeholder = root?.querySelector<HTMLElement>(
      "[data-slot='skeleton-reveal-placeholder']",
    );

    if (!root) {
      return;
    }

    if (loading) {
      if (!showSkeleton) {
        // oxlint-disable-next-line react/set-state-in-effect -- Retain the synchronously mounted skeleton for the next reveal.
        setShowSkeleton(true);
      }
      return;
    }

    if (!placeholder) {
      return;
    }

    const durationValue = getComputedStyle(placeholder).transitionDuration.split(",")[0]?.trim();
    const duration = Number.parseFloat(durationValue ?? "");
    const durationMs = Number.isFinite(duration)
      ? durationValue?.endsWith("ms")
        ? duration
        : duration * 1000
      : 400;
    const timeout = window.setTimeout(() => {
      // oxlint-disable-next-line react/set-state-in-effect -- Retain the outgoing layer until its CSS transition finishes.
      setShowSkeleton(false);
    }, durationMs);

    return () => window.clearTimeout(timeout);
  }, [loading, showSkeleton]);

  return (
    <div
      aria-busy={loading}
      className={cn(
        "t-skel",
        layout === "flow" && "t-skel-flow",
        loading && "is-resetting",
        !loading && "is-revealed",
        className,
      )}
      data-slot="skeleton-reveal"
      data-state={loading ? "loading" : "revealed"}
      ref={rootRef}
      {...props}
    >
      {shouldRenderSkeleton ? (
        <div
          aria-hidden="true"
          className={cn("t-skel-skeleton", loading && "is-pulsing", skeletonClassName)}
          data-slot="skeleton-reveal-placeholder"
        >
          {skeleton}
        </div>
      ) : null}
      <div
        aria-hidden={loading || undefined}
        className={cn("t-skel-content", contentClassName)}
        data-slot="skeleton-reveal-content"
        inert={loading || undefined}
      >
        {children}
      </div>
    </div>
  );
}

export { SkeletonReveal };
export type { SkeletonRevealProps };
