"use client";

import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from "@heroui/react";
import { buttonVariants as heroButtonVariants, type ButtonVariants } from "@heroui/styles";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type LegacyVariant = "default" | "destructive" | "link";
type LegacySize = "default" | "icon" | "icon-sm" | "icon-xs" | "icon-lg" | "xs";

const LEGACY_VARIANT_MAP: Record<LegacyVariant, NonNullable<HeroButtonProps["variant"]>> = {
  default: "primary",
  destructive: "danger",
  link: "ghost",
};

const LEGACY_SIZE_MAP: Record<
  LegacySize,
  { size?: HeroButtonProps["size"]; isIconOnly?: boolean }
> = {
  default: { size: "md" },
  xs: { size: "sm" },
  icon: { size: "md", isIconOnly: true },
  "icon-sm": { size: "sm", isIconOnly: true },
  "icon-xs": { size: "sm", isIconOnly: true },
  "icon-lg": { size: "lg", isIconOnly: true },
};

/**
 * Project Button props.
 *
 * Hero UI v3 native API (preferred at new call sites):
 *   variant: "primary" (default) | "secondary" | "danger" | "danger-soft" | "outline" | "ghost" | "tertiary"
 *   size: "sm" | "md" (default) | "lg"
 *   isIconOnly | isDisabled | fullWidth | isPending
 *
 * Legacy shadcn props still accepted (translated internally) so upstream LiveKit
 * components in src/components/agents-ui/* (which we cannot edit) keep compiling:
 *   variant: "default" → "primary", "destructive" → "danger", "link" → "ghost"
 *   size:    "default" / "xs" / "icon" / "icon-sm" / "icon-xs" / "icon-lg"
 *   disabled → isDisabled; onClick → onPress (with HTMLButtonElement event signature)
 *
 * The base type is the native button HTML element so callers may spread
 * ComponentProps<"button"> onto <Button> without TS friction.
 */
export type ButtonProps = Omit<ComponentProps<"button">, "color" | "onClick"> & {
  variant?: HeroButtonProps["variant"] | LegacyVariant;
  size?: HeroButtonProps["size"] | LegacySize;
  isDisabled?: boolean;
  isIconOnly?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isPressed?: boolean;
  fullWidth?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onPress?: HeroButtonProps["onPress"];
};

export function Button({
  variant = "primary",
  size,
  disabled,
  onClick,
  isDisabled,
  isIconOnly,
  isPending,
  isLoading,
  fullWidth,
  onPress,
  type,
  ...rest
}: ButtonProps) {
  const heroVariant: HeroButtonProps["variant"] =
    variant in LEGACY_VARIANT_MAP
      ? LEGACY_VARIANT_MAP[variant as LegacyVariant]
      : (variant as HeroButtonProps["variant"]);

  const sizeSpec =
    size && size in LEGACY_SIZE_MAP
      ? LEGACY_SIZE_MAP[size as LegacySize]
      : { size: size as HeroButtonProps["size"], isIconOnly: undefined };

  return (
    <HeroButton
      variant={heroVariant}
      size={sizeSpec.size}
      isIconOnly={sizeSpec.isIconOnly ?? isIconOnly}
      isDisabled={disabled ?? isDisabled}
      isPending={isPending ?? isLoading}
      fullWidth={fullWidth}
      type={type}
      onPress={
        onClick ? (event) => onClick(event as unknown as MouseEvent<HTMLButtonElement>) : onPress
      }
      {...(rest as Omit<HeroButtonProps, "variant" | "size">)}
    />
  );
}

/**
 * Generates the Hero UI button CSS class string for non-button elements (e.g. links).
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  isIconOnly = false,
  fullWidth = false,
  className,
}: ButtonVariants & { className?: string } = {}) {
  return cn(heroButtonVariants({ variant, size, isIconOnly, fullWidth }), className);
}

export type { ButtonVariants };

/**
 * Legacy cva config — type-only export for upstream LiveKit code in
 * src/components/agents-ui/* that references VariantProps<typeof buttonVariants>.
 */
export const buttonVariants = cva("", {
  defaultVariants: { size: "default", variant: "default" },
  variants: {
    size: {
      default: "",
      icon: "",
      "icon-lg": "",
      "icon-sm": "",
      "icon-xs": "",
      lg: "",
      sm: "",
      xs: "",
    },
    variant: {
      default: "",
      destructive: "",
      ghost: "",
      link: "",
      outline: "",
      secondary: "",
    },
  },
});

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
