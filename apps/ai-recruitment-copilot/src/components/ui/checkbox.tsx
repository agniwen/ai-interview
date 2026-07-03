"use client";

import { IconCheck } from "@tabler/icons-react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        cossControlOverlayClass,
        "peer relative size-4 shrink-0 rounded-[4px] border border-input bg-background bg-clip-padding text-primary-foreground shadow-xs/5 transition-shadow before:rounded-[3px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:shadow-none data-disabled:before:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:before:shadow-none data-checked:border-primary data-checked:bg-primary data-checked:before:shadow-none dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 grid place-content-center text-current transition-none"
      >
        <IconCheck className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
