import type { VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { cn } from "@app/shared/utils";

const badgeVariants = cva(
  "inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2.5 text-xs leading-none font-normal whitespace-nowrap transition-[color,background-color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    compoundVariants: [
      { className: "before:bg-muted-foreground/50", dot: true, variant: "default" },
      { className: "before:bg-muted-foreground/60", dot: true, variant: "secondary" },
      { className: "before:bg-muted-foreground/50", dot: true, variant: "outline" },
      { className: "before:bg-red", dot: true, variant: "destructive" },
      { className: "before:bg-green", dot: true, variant: "success" },
      { className: "before:bg-sky", dot: true, variant: "info" },
      { className: "before:bg-pink", dot: true, variant: "pink" },
      { className: "before:bg-amber", dot: true, variant: "warning" },
      { className: "before:bg-red", dot: true, variant: "danger" },
    ],
    defaultVariants: {
      dot: false,
      variant: "default",
    },
    variants: {
      // 进行中 / 结果类状态（解析中、已在招聘流程等）用“圆点 + 正文色文字”，读起来像一句说明；
      // 其余标签保持小号浅底，不默认加圆点。
      dot: {
        false: "",
        true: "border-transparent bg-transparent px-0 text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
      },
      variant: {
        // Reserve badges for scan-worthy states and selectable tags; names, counts, and dates use text.
        // 只有白 / 灰等接近背景色的中性徽标（secondary、outline）保留描边；彩色徽标只用浅底，不加描边。
        default: "bg-muted text-muted-foreground [a&]:hover:bg-accent",
        secondary:
          "border-foreground/10 bg-foreground/[0.06] text-foreground dark:border-foreground/15 dark:bg-foreground/10 [a&]:hover:bg-foreground/10",
        outline: "border-border bg-transparent text-muted-foreground [a&]:hover:bg-accent",
        destructive: "bg-red-tint text-red-ink [a&]:hover:bg-red-line",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-blue-ink underline-offset-4 [a&]:hover:underline",

        // 状态语义色。Tone helpers consumed by status meta dictionaries.
        success: "bg-green-tint text-green-ink",
        info: "bg-sky-tint text-sky-ink",
        pink: "bg-pink-tint text-pink-ink",
        warning: "bg-amber-tint text-amber-ink",
        danger: "bg-red-tint text-red-ink",
        inverse: "border-white/[0.06] bg-white/5 text-white/70",
      },
    },
  },
);

function Badge({
  className,
  dot = false,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ dot, variant }), className),
      },
      props,
    ),
    render,
    state: {
      dot,
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
