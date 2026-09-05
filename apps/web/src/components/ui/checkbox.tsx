"use client";

import { IconCheck } from "@tabler/icons-react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { cn } from "@app/shared/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        cossControlOverlayClass,
        "peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background bg-clip-padding align-middle text-primary-foreground transition-shadow before:rounded-[3px] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <IconCheck
        className="relative z-10 hidden size-3.5 text-current in-data-[checked]:block in-data-[indeterminate]:block"
        data-slot="checkbox-indicator"
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
