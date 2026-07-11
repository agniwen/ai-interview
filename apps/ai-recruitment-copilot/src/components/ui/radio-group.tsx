"use client";

import { IconCircle } from "@tabler/icons-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        cossControlOverlayClass,
        "relative inline-flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background bg-clip-padding align-middle text-primary shadow-xs/5 transition-[color,box-shadow] outline-none before:rounded-full focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:shadow-none data-disabled:before:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:before:shadow-none data-checked:before:shadow-none dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative z-10 flex items-center justify-center"
      >
        <IconCircle className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
