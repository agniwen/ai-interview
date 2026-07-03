"use client";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

const toggleVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-pressed:bg-accent data-pressed:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 min-w-9 px-2",
        lg: "h-10 min-w-10 px-2.5",
        sm: "h-8 min-w-8 px-1.5",
      },
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-background bg-clip-padding dark:bg-input/30",
      },
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(
        toggleVariants({ size, variant }),
        variant === "outline" &&
          cn(
            cossControlOverlayClass,
            "shadow-xs/5 data-pressed:before:shadow-none active:shadow-none active:before:shadow-none disabled:shadow-none disabled:before:shadow-none",
          ),
        className,
      )}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
