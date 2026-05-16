import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/shared/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        // Solid / chrome variants (legacy)
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",

        // Semantic tinted-soft variants: low-alpha fill + border + saturated text.
        // Use these for status indicators; the chrome variants stay for chips/labels.
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
        info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
        danger:
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
      },
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
