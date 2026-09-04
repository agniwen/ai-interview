"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { createContext, useContext } from "react";
import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";

const ToggleGroupContext = createContext<{ size: "default" | "sm" }>({ size: "default" });

export function ToggleGroup({
  className,
  size = "default",
  ...props
}: ToggleGroupPrimitive.Props & { size?: "default" | "sm" }) {
  return (
    <ToggleGroupContext.Provider value={{ size }}>
      <ToggleGroupPrimitive
        className={cn("inline-flex items-center gap-0.5 rounded-[8px]", className)}
        data-slot="toggle-group"
        {...props}
      />
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof Toggle>) {
  const { size } = useContext(ToggleGroupContext);
  return (
    <Toggle
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[pressed]:bg-foreground/8 data-[pressed]:text-foreground disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-foreground/12 dark:data-[pressed]:bg-foreground/12",
        size === "sm" ? "size-6" : "size-8",
        className,
      )}
      data-slot="toggle-group-item"
      {...props}
    />
  );
}
