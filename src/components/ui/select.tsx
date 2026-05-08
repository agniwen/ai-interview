"use client";

import type { ComponentProps, Key, ReactNode } from "react";
import {
  ListBox,
  ListBoxItem,
  Select as HeroSelect,
  SelectIndicator,
  SelectPopover,
  SelectTrigger as HeroSelectTrigger,
  SelectValue as HeroSelectValue,
} from "@heroui/react";

/**
 * Project Select wraps Hero UI v3 Select with a shadcn-like compositional API
 * (Select / SelectTrigger / SelectValue / SelectContent / SelectItem) so the
 * existing 12 call sites don't need to be rewritten.
 *
 * The wrapper props are intentionally permissive — agents-ui upstream code
 * passes Radix-style `open`/`onOpenChange` and other extras we forward to
 * Hero UI's underlying React Aria primitive (which ignores unknown props).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type SelectProps = AnyProps & {
  value?: string | number | null;
  defaultValue?: string | number | null;
  onValueChange?: (value: string) => void;
  selectedKey?: Key | null;
  onSelectionChange?: (key: Key) => void;
  /** Legacy alias (HTML). */
  disabled?: boolean;
  isDisabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

export function Select({
  value,
  defaultValue,
  onValueChange,
  selectedKey,
  onSelectionChange,
  disabled,
  isDisabled,
  ...props
}: SelectProps) {
  const heroSelectedKey: Key | null | undefined =
    selectedKey ?? (value === null ? null : (value as Key | undefined));
  const heroDefaultKey: Key | null | undefined =
    defaultValue === null ? null : (defaultValue as Key | undefined);
  const heroOnChange = (key: Key) => {
    onSelectionChange?.(key);
    onValueChange?.(String(key));
  };
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <HeroSelect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isDisabled={disabled ?? isDisabled}
      selectedKey={heroSelectedKey}
      defaultSelectedKey={heroDefaultKey}
      onSelectionChange={heroOnChange}
    />
  );
}

export type SelectTriggerProps = AnyProps & {
  size?: string;
  children?: ReactNode;
  className?: string;
};
export function SelectTrigger({ size: _size, children, ...props }: SelectTriggerProps) {
  return (
    <HeroSelectTrigger {...props}>
      {children}
      <SelectIndicator />
    </HeroSelectTrigger>
  );
}

export type SelectValueProps = AnyProps & {
  placeholder?: ReactNode;
  children?: ReactNode;
};
export function SelectValue({ placeholder, children: _children, ...props }: SelectValueProps) {
  return (
    <HeroSelectValue {...props}>
      {(state) => {
        if (state.isPlaceholder) return placeholder ?? state.defaultChildren ?? null;
        return state.selectedText ?? state.defaultChildren ?? null;
      }}
    </HeroSelectValue>
  );
}

export type SelectContentProps = AnyProps & {
  position?: string;
  children?: ReactNode;
  className?: string;
};
export function SelectContent({ position: _position, children, ...props }: SelectContentProps) {
  return (
    <SelectPopover {...props}>
      <ListBox>{children as never}</ListBox>
    </SelectPopover>
  );
}

export type SelectItemProps = AnyProps & {
  value?: Key;
  children?: ReactNode;
  disabled?: boolean;
};
export function SelectItem({ value, disabled, children, ...props }: SelectItemProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ListBoxItem {...(props as any)} id={value} isDisabled={disabled}>
      {children as never}
    </ListBoxItem>
  );
}

export function SelectGroup({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function SelectLabel({ children, className }: ComponentProps<"div">) {
  return <div className={className}>{children}</div>;
}

export function SelectSeparator() {
  return null;
}

export function SelectScrollUpButton() {
  return null;
}
export function SelectScrollDownButton() {
  return null;
}

export { SelectIndicator, SelectPopover };
