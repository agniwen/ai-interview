"use client";

import type { VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@arc/shared/utils";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    orientation?: "horizontal" | "vertical";
    spacing?: number;
  }
>({
  orientation: "horizontal",
  size: "default",
  spacing: 0,
  variant: "default",
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    orientation?: "horizontal" | "vertical";
    spacing?: number;
  }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-vertical:flex-col data-vertical:items-stretch",
        "data-[spacing=default]:data-[variant=outline]:relative data-[spacing=default]:data-[variant=outline]:shadow-xs/5 data-[spacing=default]:data-[variant=outline]:before:pointer-events-none data-[spacing=default]:data-[variant=outline]:before:absolute data-[spacing=default]:data-[variant=outline]:before:inset-0 data-[spacing=default]:data-[variant=outline]:before:rounded-[calc(var(--radius-md)-1px)] data-[spacing=default]:data-[variant=outline]:before:shadow-[0_1px_--theme(--color-black/4%)] dark:data-[spacing=default]:data-[variant=outline]:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext value={{ orientation, size, spacing, variant }}>
        {children}
      </ToggleGroupContext>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.use(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          size: context.size || size,
          variant: context.variant || variant,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-md group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-md group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-md group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-md group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
