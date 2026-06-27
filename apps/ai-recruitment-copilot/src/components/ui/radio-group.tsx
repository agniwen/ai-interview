"use client";

import { IconCircle } from "@tabler/icons-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        cossControlOverlayClass,
        "relative aspect-square size-4 shrink-0 rounded-full border border-input bg-background bg-clip-padding text-primary shadow-xs/5 transition-[color,box-shadow] outline-none before:rounded-full focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:before:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:before:shadow-none data-[state=checked]:before:shadow-none dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative z-10 flex items-center justify-center"
      >
        <IconCircle className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
