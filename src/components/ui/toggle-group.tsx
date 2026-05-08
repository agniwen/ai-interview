"use client";

import {
  ToggleButton as HeroToggleButton,
  ToggleButtonGroup as HeroToggleButtonGroup,
  type ToggleButtonGroupProps as HeroToggleButtonGroupProps,
  type ToggleButtonProps as HeroToggleButtonProps,
} from "@heroui/react";

type LegacyVariant = "outline";
type LegacySize = "default";

export type ToggleGroupProps = Omit<HeroToggleButtonGroupProps, "size"> & {
  size?: HeroToggleButtonGroupProps["size"] | LegacySize;
};

export function ToggleGroup({ size, ...props }: ToggleGroupProps) {
  const heroSize: HeroToggleButtonGroupProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroToggleButtonGroupProps["size"]);
  return <HeroToggleButtonGroup size={heroSize} {...props} />;
}

export type ToggleGroupItemProps = Omit<HeroToggleButtonProps, "variant" | "size"> & {
  variant?: HeroToggleButtonProps["variant"] | LegacyVariant;
  size?: HeroToggleButtonProps["size"] | LegacySize;
  disabled?: boolean;
  pressed?: boolean;
};

export function ToggleGroupItem({
  variant,
  size,
  disabled,
  pressed,
  ...props
}: ToggleGroupItemProps) {
  const heroVariant: HeroToggleButtonProps["variant"] =
    variant === "outline" ? "ghost" : (variant as HeroToggleButtonProps["variant"]);
  const heroSize: HeroToggleButtonProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroToggleButtonProps["size"]);
  return (
    <HeroToggleButton
      variant={heroVariant}
      size={heroSize}
      isDisabled={disabled ?? props.isDisabled}
      isSelected={pressed ?? props.isSelected}
      {...props}
    />
  );
}
