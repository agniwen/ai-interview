"use client";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ScrollAreaProps = Omit<ComponentProps<typeof OverlayScrollbarsComponent>, "element"> & {
  /** Forwarded to OverlayScrollbars autoHide option. */
  scrollbars?: "scroll" | "leave" | "move" | "never";
};

function ScrollArea({ className, children, scrollbars = "leave", ...props }: ScrollAreaProps) {
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
