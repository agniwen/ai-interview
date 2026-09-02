import type { ComponentProps } from "react";

import { cn } from "@app/shared/utils";

export function EmptyValue({ className, children = "—", ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("text-muted-foreground/60", className)} data-slot="empty-value" {...props}>
      {children}
    </span>
  );
}
