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
        "relative border border-foreground/10 bg-background/95 bg-clip-padding shadow-[0_1px_3px_rgb(0_0_0/0.03),0_6px_18px_-6px_rgb(0_0_0/0.09)] backdrop-blur-xl dark:border-foreground/15 dark:shadow-[0_1px_3px_rgb(0_0_0/0.09),0_6px_18px_-6px_rgb(0_0_0/0.22)]",
        className,
      )}
    />
  );
}
