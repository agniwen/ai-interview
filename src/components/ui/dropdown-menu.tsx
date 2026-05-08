"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Dropdown as HeroDropdown,
  DropdownItem as HeroDropdownItem,
  DropdownMenu as HeroDropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger as HeroDropdownTrigger,
} from "@heroui/react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

/**
 * Project DropdownMenu wraps Hero UI v3 Dropdown family. Hero UI structure:
 *   <Dropdown>
 *     <DropdownTrigger>{trigger}</DropdownTrigger>
 *     <DropdownPopover>
 *       <DropdownMenu>
 *         <DropdownItem>Item</DropdownItem>
 *       </DropdownMenu>
 *     </DropdownPopover>
 *   </Dropdown>
 *
 * Our wrapper preserves shadcn DropdownMenu* names so the 6 call sites
 * don't need to be rewritten. DropdownMenuContent transparently renders
 * the DropdownPopover + DropdownMenu pair.
 */

export type DropdownMenuProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  children?: ReactNode;
};

export function DropdownMenu({ open, onOpenChange, isOpen, ...props }: DropdownMenuProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <HeroDropdown {...(props as any)} isOpen={open ?? isOpen} onOpenChange={onOpenChange} />
  );
}

export type DropdownMenuTriggerProps = AnyProps & {
  asChild?: boolean;
  children?: ReactNode;
};
export function DropdownMenuTrigger({ asChild: _asChild, ...props }: DropdownMenuTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroDropdownTrigger {...(props as any)} />;
}

export type DropdownMenuContentProps = AnyProps & {
  align?: string;
  side?: string;
  sideOffset?: number;
  children?: ReactNode;
  className?: string;
};

export function DropdownMenuContent({
  align: _align,
  side,
  sideOffset,
  children,
  className,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownPopover
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      placement={side as never}
      offset={sideOffset}
    >
      <HeroDropdownMenu className={className}>{children as never}</HeroDropdownMenu>
    </DropdownPopover>
  );
}

export type DropdownMenuItemProps = {
  inset?: boolean;
  variant?: "default" | "destructive";
  /** Legacy (Radix). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelect?: (event: any) => void;
  /** Legacy (Radix). */
  disabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (event: any) => void;
  children?: ReactNode;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export function DropdownMenuItem({
  inset: _inset,
  variant,
  onSelect,
  onClick,
  disabled,
  className,
  ...props
}: DropdownMenuItemProps) {
  return (
    <HeroDropdownItem
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isDisabled={disabled}
      className={cn(variant === "destructive" && "text-danger", className)}
      onAction={() => {
        onClick?.(new Event("click"));
        onSelect?.(new Event("select"));
      }}
    >
      {props.children as never}
    </HeroDropdownItem>
  );
}

export function DropdownMenuGroup({ children }: { children?: ReactNode }) {
  return <DropdownSection>{children as never}</DropdownSection>;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-2 py-1.5 text-sm font-medium", className)} {...props} />;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-divider", className)} />;
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-default-500", className)}
      {...props}
    />
  );
}

export function DropdownMenuPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** Stubs for Radix-only sub-menu / checkbox / radio item types. */
export function DropdownMenuSub({ children }: AnyProps & { children?: ReactNode }) {
  return <>{children}</>;
}
export function DropdownMenuSubTrigger({ children, className }: ComponentProps<"div">) {
  return <div className={className}>{children}</div>;
}
export function DropdownMenuSubContent({ children }: AnyProps & { children?: ReactNode }) {
  return <>{children}</>;
}
export function DropdownMenuCheckboxItem({ children, ...props }: DropdownMenuItemProps) {
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}
export function DropdownMenuRadioGroup({ children }: AnyProps & { children?: ReactNode }) {
  return <>{children}</>;
}
export function DropdownMenuRadioItem({ children, ...props }: DropdownMenuItemProps) {
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}
