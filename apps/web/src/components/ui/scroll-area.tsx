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

const SCROLL_FADE_EDGE_TOLERANCE = 1;

/**
 * shadcn 的 scroll-fade 在不支持 `animation-timeline: scroll()` 的浏览器（Firefox、旧版 Safari）里
 * 会把上下渐隐常开，盖住顶部第一项。这里按真实滚动位置写入同名变量；支持的浏览器里滚动驱动动画
 * 优先级高于内联样式，行为不变。
 * Without scroll-driven animations the shadcn fallback keeps both fades on, washing out the first
 * item at the top. Mirror the real scroll position instead; where the animation exists it still wins.
 */
function syncScrollFade(viewport: HTMLElement) {
  const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
  const showTop = viewport.scrollTop > SCROLL_FADE_EDGE_TOLERANCE;
  const showBottom = viewport.scrollTop < maxScrollTop - SCROLL_FADE_EDGE_TOLERANCE;
  viewport.style.setProperty("--scroll-fade-t", showTop ? "var(--_scroll-fade-size-t)" : "0px");
  viewport.style.setProperty("--scroll-fade-b", showBottom ? "var(--_scroll-fade-size-b)" : "0px");
}

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
          ...(scrollFade && {
            scroll: (instance, event) => {
              externalEvents?.scroll?.(instance, event);
              syncScrollFade(instance.elements().viewport);
            },
            updated: (instance, onUpdatedArgs) => {
              externalEvents?.updated?.(instance, onUpdatedArgs);
              syncScrollFade(instance.elements().viewport);
            },
          }),
          initialized: (instance) => {
            externalEvents?.initialized?.(instance);
            const { viewport } = instance.elements();
            if (scrollFade) {
              viewport.classList.add("scroll-fade");
              syncScrollFade(viewport);
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

export { ScrollArea };
