import type { VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { cn } from "@app/shared/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2.5 py-1 text-xs font-normal whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        // Reserve badges for scan-worthy states and selectable tags; names, counts, and dates use text.
        // Neutral variants group labels; semantic variants reserve color for actionable states.
        default: "border-transparent bg-muted text-muted-foreground [a&]:hover:bg-accent",
        secondary:
          "border-foreground/15 bg-foreground/[0.06] text-foreground dark:border-foreground/20 dark:bg-foreground/10 [a&]:hover:bg-foreground/10",
        outline: "border-border bg-transparent text-muted-foreground [a&]:hover:bg-accent",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15 [a&]:hover:bg-destructive/15",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",

        // 状态语义色。Tone helpers consumed by status meta dictionaries.
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
        info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
        danger:
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
        inverse: "border-white/10 bg-white/5 text-white/70",
      },
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
