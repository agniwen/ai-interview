"use client";

import type { ComponentProps } from "react";
import {
  ToggleButton as HeroToggleButton,
  type ToggleButtonProps as HeroToggleButtonProps,
} from "@heroui/react";
import { cva, type VariantProps } from "class-variance-authority";

type LegacyVariant = "outline";
type LegacySize = "default";

export interface ToggleProps extends Omit<ComponentProps<"button">, "color" | "onChange"> {
  variant?: HeroToggleButtonProps["variant"] | LegacyVariant;
  size?: HeroToggleButtonProps["size"] | LegacySize;
  /** Legacy alias (Radix). */
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (...args: any[]) => any;
}

export function Toggle({
  variant,
  size,
  disabled,
  pressed,
  defaultPressed,
  onPressedChange,
  isDisabled,
  isSelected,
  defaultSelected,
  onChange,
  isIconOnly,
  type = "button",
  ...rest
}: ToggleProps) {
  const heroVariant: HeroToggleButtonProps["variant"] =
    variant === "outline" ? "ghost" : (variant as HeroToggleButtonProps["variant"]);
  const heroSize: HeroToggleButtonProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroToggleButtonProps["size"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp = HeroToggleButton as unknown as (props: any) => React.JSX.Element;
  return (
    <Comp
      variant={heroVariant}
      size={heroSize}
      type={type}
      isDisabled={disabled ?? isDisabled}
      isSelected={pressed ?? isSelected}
      defaultSelected={defaultPressed ?? defaultSelected}
      isIconOnly={isIconOnly}
      onChange={onPressedChange ?? onChange}
      {...rest}
    />
  );
}

/**
 * Legacy cva — kept so upstream LiveKit code in src/components/agents-ui/* that
 * does `VariantProps<typeof toggleVariants>` keeps inferring the original
 * `variant: "default" | "outline"` and `size: "default" | "sm" | "lg"` enums.
 */
export const toggleVariants = cva("", {
  defaultVariants: { size: "default", variant: "default" },
  variants: {
    size: { default: "", sm: "", lg: "" },
    variant: { default: "", outline: "" },
  },
});

export type ToggleVariantProps = VariantProps<typeof toggleVariants>;
