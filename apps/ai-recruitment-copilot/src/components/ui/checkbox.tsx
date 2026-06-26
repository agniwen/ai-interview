"use client";

import { CheckIcon } from "@/components/icons/hugeicons";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        cossControlOverlayClass,
        "peer relative size-4 shrink-0 rounded-[4px] border border-input bg-background bg-clip-padding text-primary-foreground shadow-xs/5 transition-shadow before:rounded-[3px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:before:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:before:shadow-none data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:before:shadow-none dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
