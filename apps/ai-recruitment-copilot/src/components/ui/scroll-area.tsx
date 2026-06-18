"use client";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { ComponentProps, Ref } from "react";

import { cn } from "@arc/shared/utils";

type ScrollAreaProps = Omit<ComponentProps<typeof OverlayScrollbarsComponent>, "element"> & {
  /** Forwarded to OverlayScrollbars autoHide option. */
  scrollbars?: "leave" | "move" | "never" | "scroll";
  orientation?: "horizontal" | "vertical";
  scrollbarGutter?: boolean;
  scrollFade?: boolean;
  viewportClassName?: string;
  viewportProps?: ComponentProps<"div">;
  viewportRef?: Ref<HTMLDivElement>;
};

function ScrollArea({
  className,
  children,
  orientation,
  scrollbarGutter,
  scrollFade,
  scrollbars = "leave",
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  if (
    viewportClassName ||
    viewportProps ||
    viewportRef ||
    orientation ||
    scrollbarGutter ||
    scrollFade
  ) {
    const { className: innerClassName, style: innerStyle, ...innerProps } = viewportProps ?? {};

    return (
      <div
        className={cn("relative overflow-hidden", className)}
        data-slot="scroll-area"
        {...(props as ComponentProps<"div">)}
      >
        <div
          ref={viewportRef}
          className={cn(
            "h-full w-full min-w-0 overflow-auto",
            orientation === "horizontal" && "overflow-x-auto overflow-y-hidden",
            scrollFade &&
              "mask-b-from-90% mask-b-to-100% [mask-repeat:no-repeat] [mask-size:100%_100%]",
            viewportClassName,
            innerClassName,
          )}
          style={{
            scrollbarGutter: scrollbarGutter ? "stable" : undefined,
            ...innerStyle,
          }}
          {...innerProps}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <OverlayScrollbarsComponent
      className={cn("relative", className)}
      data-slot="scroll-area"
      defer
      element="div"
      options={{
        scrollbars: {
          autoHide: scrollbars,
          autoHideDelay: 600,
          theme: "os-theme-app",
        },
      }}
      {...props}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

/**
 * Compatibility shim. OverlayScrollbars renders its own scrollbars, so this is a no-op
 * kept around so existing call sites that import `ScrollBar` keep type-checking.
 */
function ScrollBar(_props: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return null;
}

export { ScrollArea, ScrollBar };
