"use client";

import type { ReactNode } from "react";
import {
  Radio as HeroRadio,
  RadioContent,
  RadioControl,
  RadioGroup as HeroRadioGroup,
  RadioIndicator,
  type RadioGroupProps as HeroRadioGroupProps,
  type RadioProps as HeroRadioProps,
} from "@heroui/react";

export type RadioGroupProps = Omit<HeroRadioGroupProps, "onChange"> & {
  /** Legacy alias (shadcn/Radix). Prefer Hero UI's React Aria onChange. */
  onValueChange?: (value: string) => void;
};

export function RadioGroup({ onValueChange, ...props }: RadioGroupProps) {
  return <HeroRadioGroup onChange={onValueChange} {...props} />;
}

export type RadioGroupItemProps = Omit<HeroRadioProps, "children"> & {
  children?: ReactNode;
  /** Legacy alias (HTML). Prefer `isDisabled`. */
  disabled?: boolean;
};

export function RadioGroupItem({ children, disabled, ...props }: RadioGroupItemProps) {
  return (
    <HeroRadio isDisabled={disabled ?? props.isDisabled} {...props}>
      <RadioControl>
        <RadioIndicator />
      </RadioControl>
      {children ? <RadioContent>{children}</RadioContent> : null}
    </HeroRadio>
  );
}

export type { HeroRadioProps as RadioProps };
