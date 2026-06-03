import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/shared/utils";

type SoftPanelProps<T extends ElementType> = {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function SoftPanel<T extends ElementType = "div">({
  as,
  className,
  ...props
}: SoftPanelProps<T>) {
  const Component = as ?? "div";

  return (
    <Component
      className={cn("rounded-xl border border-border/50 bg-muted/40", className)}
      {...props}
    />
  );
}
