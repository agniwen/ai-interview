import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@arc/shared/utils";

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
      className={cn("rounded-xl border border-muted/60 bg-muted/20", className)}
      {...props}
    />
  );
}
