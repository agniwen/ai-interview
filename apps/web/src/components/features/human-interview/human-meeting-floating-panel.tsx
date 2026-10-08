import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";

export function HumanMeetingFloatingPanel({
  open,
  className,
  ...props
}: ComponentProps<"aside"> & { open: boolean }) {
  return (
    <aside
      {...props}
      aria-hidden={!open}
      inert={!open}
      data-state={open ? "open" : "closed"}
      className={cn(
        "absolute right-3 bottom-3 z-30 flex h-[32rem] max-h-[calc(100%-1.5rem)] w-96 flex-col overflow-hidden rounded-xl border bg-background shadow-lg outline-none",
        "origin-bottom-right transition-[opacity,translate,scale,visibility] duration-200 ease-[var(--ease-smooth-out)] motion-reduce:transition-none motion-reduce:translate-none motion-reduce:scale-100",
        open
          ? "visible translate-x-0 translate-y-0 scale-100 opacity-100"
          : "invisible translate-x-1.5 translate-y-1.5 scale-95 opacity-0",
        className,
      )}
    />
  );
}
