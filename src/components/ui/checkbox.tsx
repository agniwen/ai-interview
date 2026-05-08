"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import {
  Checkbox as HeroCheckbox,
  CheckboxContent,
  CheckboxControl,
  CheckboxIndicator,
  type CheckboxProps as HeroCheckboxProps,
} from "@heroui/react";

export type CheckboxProps = Omit<HeroCheckboxProps, "children" | "onChange"> & {
  children?: ReactNode;
  /** Legacy alias (shadcn). Prefer `isSelected`. */
  checked?: boolean | "indeterminate";
  /** Legacy alias (shadcn). */
  onCheckedChange?: (checked: boolean) => void;
  /** Legacy alias (HTML). Prefer `isDisabled`. */
  disabled?: boolean;
};

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  children,
  ...props
}: CheckboxProps) {
  const isSelected = checked === "indeterminate" ? false : (checked ?? props.isSelected);
  return (
    <HeroCheckbox
      isSelected={isSelected}
      isIndeterminate={checked === "indeterminate" || props.isIndeterminate}
      isDisabled={disabled ?? props.isDisabled}
      onChange={onCheckedChange}
      {...props}
    >
      <CheckboxControl>
        <CheckboxIndicator>
          <CheckIcon className="size-3.5" />
        </CheckboxIndicator>
      </CheckboxControl>
      {children ? <CheckboxContent>{children}</CheckboxContent> : null}
    </HeroCheckbox>
  );
}
