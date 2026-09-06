import type { VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@app/shared/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:inset-shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        icon: "size-9",
        "icon-lg": "size-10",
        "icon-sm": "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default:
          "border border-primary-border bg-primary text-primary-foreground shadow-[0_1px_2px_0_--theme(--color-primary/24%)] inset-shadow-[0_1px_--theme(--color-white/16%)] hover:bg-primary/90 active:inset-shadow-[0_1px_--theme(--color-black/8%)]",
        destructive:
          "border border-destructive/20 bg-destructive/8 text-destructive hover:border-destructive/30 hover:bg-destructive/12 hover:text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/12 dark:hover:bg-destructive/18",
        ghost:
          "hover:bg-accent hover:border-border/80 border border-transparent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary-link underline-offset-4 hover:underline",
        outline:
          "border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        text: "border border-transparent bg-transparent text-foreground shadow-none hover:border-transparent hover:bg-transparent hover:text-foreground active:scale-100",
      },
    },
  },
);

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

const ButtonSizeContext = React.createContext<ButtonSize | undefined>(undefined);

function ButtonSizeProvider({ size, children }: { size: ButtonSize; children: React.ReactNode }) {
  return <ButtonSizeContext.Provider value={size}>{children}</ButtonSizeContext.Provider>;
}

function Button({
  className,
  variant = "default",
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const inheritedSize = React.useContext(ButtonSizeContext);
  const resolvedSize = size ?? inheritedSize ?? "default";

  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={resolvedSize}
      className={cn(buttonVariants({ size: resolvedSize, variant }), className)}
      {...props}
    />
  );
}

export { Button, ButtonSizeProvider, buttonVariants };
