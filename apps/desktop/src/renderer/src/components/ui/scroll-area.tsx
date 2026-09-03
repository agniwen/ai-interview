"use client";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { EventListeners, PartialOptions } from "overlayscrollbars";
import type { ComponentProps, Ref } from "react";

import { cn } from "@app/shared/utils";

type ScrollAreaProps = Omit<ComponentProps<typeof OverlayScrollbarsComponent>, "element"> & {
  /** Forwarded to OverlayScrollbars autoHide option. */
  scrollbars?: "leave" | "move" | "never" | "scroll";
  orientation?: "horizontal" | "vertical";
  scrollbarGutter?: boolean;
  scrollFade?: boolean;
  scrollRestorationId?: string;
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
  scrollbars = "scroll",
  scrollRestorationId,
  events: externalEvents,
  options: optionsProp,
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  // Native viewport path — only when callers need a real DOM viewport ref/class.
  // `orientation` alone stays on OverlayScrollbars (overlay thumbs, no layout cost).
  if (viewportClassName || viewportProps || viewportRef || scrollbarGutter) {
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
            scrollFade && (orientation === "horizontal" ? "scroll-fade-x" : "scroll-fade"),
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

  const fadeClass = orientation === "horizontal" ? "scroll-fade-x" : "scroll-fade";

  const events: EventListeners | undefined =
    scrollFade || scrollRestorationId || externalEvents
      ? {
          ...externalEvents,
          initialized: (instance) => {
            externalEvents?.initialized?.(instance);
            const { viewport } = instance.elements();
            if (scrollFade) {
              viewport.classList.add(fadeClass);
            }
            if (scrollRestorationId) {
              viewport.setAttribute("data-scroll-restoration-id", scrollRestorationId);
            }
          },
        }
      : undefined;

  const orientationOverflow: PartialOptions["overflow"] =
    orientation === "horizontal"
      ? { x: "scroll", y: "hidden" }
      : orientation === "vertical"
        ? { x: "hidden", y: "scroll" }
        : undefined;

  return (
    <OverlayScrollbarsComponent
      className={cn("relative", className)}
      data-slot="scroll-area"
      defer
      element="div"
      events={events}
      options={{
        overflow: orientationOverflow,
        ...optionsProp,
        scrollbars: {
          autoHide: scrollbars,
          autoHideDelay: 600,
          theme: "os-theme-app",
          ...optionsProp?.scrollbars,
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
