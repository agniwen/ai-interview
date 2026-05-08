"use client";

import { ButtonGroup, type ButtonGroupProps } from "@heroui/react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export { ButtonGroup, type ButtonGroupProps };

/**
 * Inline non-button text/segment inside a <ButtonGroup>. Hero UI's ButtonGroup
 * doesn't ship a direct equivalent; this matches the prior shadcn helper visually.
 */
export function ButtonGroupText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-default px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn("relative !m-0 self-stretch data-[orientation=vertical]:h-auto", className)}
      {...props}
    />
  );
}
