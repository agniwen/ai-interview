import type { VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@app/shared/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] leading-5 font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:inset-shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 rounded-lg px-3 has-[>svg]:px-2.5",
        icon: "size-8 rounded-lg",
        "icon-lg": "size-10 rounded-lg [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-7 rounded-lg",
        "icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        lg: "h-10 rounded-lg gap-2 px-3.5 has-[>svg]:px-3",
        sm: "h-7 rounded-lg px-2.5 has-[>svg]:px-2",
        xs: "h-6 gap-1 px-2 text-xs leading-4 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "border border-primary-border bg-primary text-primary-foreground shadow-[0_1px_2px_0_--theme(--color-primary/24%)] inset-shadow-[0_1px_--theme(--color-white/16%)] hover:bg-primary/90 active:inset-shadow-[0_1px_--theme(--color-black/8%)]",
        // Interfere Danger：实心用于不可逆操作的最终确认，subtle 用于常驻或次要的删除入口。
        // 禁用态按规范改为灰底灰字，不再整体半透明。
        // Solid danger confirms irreversible actions; subtle marks resident or secondary destructive entries.
        destructive:
          "border border-transparent bg-danger-solid text-on-danger-solid hover:bg-danger-solid-hover active:bg-danger-solid-active focus-visible:border-transparent focus-visible:ring-danger-solid/40 disabled:bg-(--gray-a3) disabled:text-(--gray-a8) disabled:opacity-100 dark:disabled:bg-(--gray-a2)",
        "destructive-subtle":
          "border border-transparent bg-danger-subtle text-danger-foreground inset-ring inset-ring-danger-subtle-ring hover:bg-danger-subtle-hover active:bg-danger-subtle-active focus-visible:border-transparent focus-visible:ring-danger-solid/40 disabled:bg-(--gray-a3) disabled:text-(--gray-a8) disabled:opacity-100 disabled:inset-ring-transparent dark:disabled:bg-(--gray-a2)",
        ghost:
          "border border-transparent hover:bg-component hover:text-accent-foreground active:bg-component-active",
        link: "cursor-pointer text-primary-link underline-offset-4 hover:underline focus-visible:border-transparent focus-visible:underline focus-visible:ring-0",
        outline:
          "border border-transparent bg-control shadow-default hover:bg-(--gray-2) hover:text-accent-foreground dark:hover:bg-(--gray-3)",
        secondary:
          "border border-transparent bg-component text-secondary-foreground hover:bg-component-hover active:bg-component-active",
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
