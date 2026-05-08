"use client";

import { Chip as HeroChip, type ChipProps as HeroChipProps, chipVariants } from "@heroui/react";
import type { ReactNode } from "react";

/**
 * Project Badge wraps Hero UI Chip. Hero UI's own Badge is a notification-angle
 * indicator with `placement`, semantically different from shadcn Badge.
 * Hero UI Chip API: color (default|accent|danger|success|warning), variant
 * (primary|secondary|soft|tertiary), size (sm|md|lg). We translate legacy
 * shadcn-style variant names to a (color, variant) pair.
 */
type LegacyVariant = "default" | "destructive" | "outline" | "ghost" | "link" | "secondary";

const LEGACY_MAP: Record<
  LegacyVariant,
  { color?: HeroChipProps["color"]; variant?: HeroChipProps["variant"] }
> = {
  default: { color: "accent", variant: "primary" },
  destructive: { color: "danger", variant: "primary" },
  outline: { color: "default", variant: "tertiary" },
  ghost: { color: "default", variant: "soft" },
  link: { color: "accent", variant: "soft" },
  secondary: { color: "default", variant: "secondary" },
};

export type BadgeProps = Omit<HeroChipProps, "children" | "variant"> & {
  children?: ReactNode;
  variant?: HeroChipProps["variant"] | LegacyVariant;
  asChild?: boolean;
};

export function Badge({
  variant = "default",
  asChild: _asChild,
  color,
  children,
  ...props
}: BadgeProps) {
  if (variant && variant in LEGACY_MAP) {
    const mapped = LEGACY_MAP[variant as LegacyVariant];
    return (
      <HeroChip color={color ?? mapped.color} variant={mapped.variant} {...props}>
        {children ?? null}
      </HeroChip>
    );
  }
  return (
    <HeroChip color={color} variant={variant as HeroChipProps["variant"]} {...props}>
      {children ?? null}
    </HeroChip>
  );
}

export { chipVariants as badgeVariants };
