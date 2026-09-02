"use client";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { EventListeners } from "overlayscrollbars";
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
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  if (viewportClassName || viewportProps || viewportRef || orientation || scrollbarGutter) {
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

  const events: EventListeners | undefined =
    scrollFade || scrollRestorationId || externalEvents
      ? {
          ...externalEvents,
          initialized: (instance) => {
            externalEvents?.initialized?.(instance);
            const { viewport } = instance.elements();
            if (scrollFade) {
              viewport.classList.add("scroll-fade");
            }
            if (scrollRestorationId) {
              viewport.setAttribute("data-scroll-restoration-id", scrollRestorationId);
            }
          },
        }
      : undefined;

  return (
    <OverlayScrollbarsComponent
      className={cn("relative", className)}
      data-slot="scroll-area"
      defer
      element="div"
      events={events}
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
