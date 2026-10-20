import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";

/** Shared floating surface. Match --floating-bar-inset to the content padding. */
export function FloatingBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-bar"
      {...props}
      className={cn(
        "pointer-events-auto [--floating-bar-inset:0.25rem] rounded-[calc(var(--radius-md)+var(--floating-bar-inset))]",
        "relative bg-background/95 shadow-large backdrop-blur-xl",
        className,
      )}
    />
  );
}
