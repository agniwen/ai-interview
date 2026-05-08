"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Popover as HeroPopover,
  PopoverContent as HeroPopoverContent,
  PopoverTrigger as HeroPopoverTrigger,
} from "@heroui/react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type PopoverProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  children?: ReactNode;
};

export function Popover({ open, onOpenChange, isOpen, ...props }: PopoverProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <HeroPopover {...(props as any)} isOpen={open ?? isOpen} onOpenChange={onOpenChange} />
  );
}

export type PopoverTriggerProps = AnyProps & { asChild?: boolean; children?: ReactNode };
export function PopoverTrigger({ asChild: _asChild, ...props }: PopoverTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroPopoverTrigger {...(props as any)} />;
}

export type PopoverContentProps = AnyProps & {
  align?: string;
  side?: string;
  sideOffset?: number;
  onOpenAutoFocus?: (event: Event) => void;
  children?: ReactNode;
  className?: string;
};
export function PopoverContent({
  align: _align,
  side,
  sideOffset,
  onOpenAutoFocus: _onOpenAutoFocus,
  ...props
}: PopoverContentProps) {
  return (
    <HeroPopoverContent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      placement={side as never}
      offset={sideOffset}
    />
  );
}

export function PopoverAnchor({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function PopoverHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

export function PopoverTitle({ className, ...props }: ComponentProps<"h2">) {
  return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="popover-description" className={cn("text-muted", className)} {...props} />;
}
