import type * as React from "react";
import { cn } from "@arc/shared/utils";

export function Frame({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl bg-muted/72 p-1",
        "*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1",
        className,
      )}
      data-slot="frame"
      {...props}
    />
  );
}

export function FramePanel({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("relative rounded-xl border border-muted bg-background px-4 py-5", className)}
      data-slot="frame-panel"
      {...props}
    />
  );
}

export function FrameHeader({
  className,
  ...props
}: React.ComponentProps<"header">): React.ReactElement {
  return (
    <header
      className={cn(
        "flex h-8 flex-row items-center px-4",
        "has-[[data-slot=frame-panel-description]]:h-16",
        className,
      )}
      data-slot="frame-panel-header"
      {...props}
    />
  );
}

export function FrameHeading({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex min-w-0 flex-1 flex-col justify-center gap-0.5", className)}
      data-slot="frame-panel-heading"
      {...props}
    />
  );
}

export function FrameTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("truncate font-semibold text-sm leading-5", className)}
      data-slot="frame-panel-title"
      {...props}
    />
  );
}

export function FrameDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("truncate text-muted-foreground text-xs leading-4", className)}
      data-slot="frame-panel-description"
      {...props}
    />
  );
}

export function FrameFooter({
  className,
  ...props
}: React.ComponentProps<"footer">): React.ReactElement {
  return (
    <footer className={cn("px-5 py-4", className)} data-slot="frame-panel-footer" {...props} />
  );
}
