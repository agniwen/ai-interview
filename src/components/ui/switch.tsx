"use client";

import type { ReactNode } from "react";
import {
  Switch as HeroSwitch,
  SwitchContent,
  SwitchControl,
  SwitchThumb,
  type SwitchProps as HeroSwitchProps,
} from "@heroui/react";

type LegacySize = "default";

export type SwitchProps = Omit<HeroSwitchProps, "children" | "onChange" | "size"> & {
  children?: ReactNode;
  size?: HeroSwitchProps["size"] | LegacySize;
  /** Legacy alias (shadcn). Prefer `isSelected`. */
  checked?: boolean;
  /** Legacy alias (shadcn). */
  onCheckedChange?: (checked: boolean) => void;
  /** Legacy alias (HTML). Prefer `isDisabled`. */
  disabled?: boolean;
};

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  size,
  children,
  ...props
}: SwitchProps) {
  const heroSize: HeroSwitchProps["size"] =
    size === "default" || size === undefined ? "md" : (size as HeroSwitchProps["size"]);
  return (
    <HeroSwitch
      size={heroSize}
      isSelected={checked ?? props.isSelected}
      isDisabled={disabled ?? props.isDisabled}
      onChange={onCheckedChange}
      {...props}
    >
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
      {children ? <SwitchContent>{children}</SwitchContent> : null}
    </HeroSwitch>
  );
}
