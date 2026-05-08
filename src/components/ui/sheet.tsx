"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Drawer as HeroDrawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent as HeroDrawerContent,
  DrawerFooter as HeroDrawerFooter,
  DrawerHeader as HeroDrawerHeader,
  DrawerHeading,
  DrawerTrigger as HeroDrawerTrigger,
} from "@heroui/react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type SheetProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  children?: ReactNode;
};

export function Sheet({ open, onOpenChange, isOpen, ...props }: SheetProps) {
  return (
    <HeroDrawer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isOpen={open ?? isOpen}
      onOpenChange={onOpenChange}
    />
  );
}

export type SheetTriggerProps = AnyProps & { asChild?: boolean; children?: ReactNode };
export function SheetTrigger({ asChild: _asChild, ...props }: SheetTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroDrawerTrigger {...(props as any)} />;
}

export type SheetCloseProps = AnyProps & { asChild?: boolean; children?: ReactNode };
export function SheetClose({ asChild: _asChild, ...props }: SheetCloseProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <DrawerCloseTrigger {...(props as any)} />;
}

export type SheetContentProps = AnyProps & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  children?: ReactNode;
  className?: string;
};
export function SheetContent({
  side = "right",
  showCloseButton: _showCloseButton,
  children,
  className,
  ...props
}: SheetContentProps) {
  return (
    <>
      <DrawerBackdrop />
      <HeroDrawerContent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(props as any)}
        placement={side}
        className={cn("flex flex-col gap-4", className)}
      >
        {children as never}
      </HeroDrawerContent>
    </>
  );
}

export type SheetHeaderProps = ComponentProps<"div">;
export function SheetHeader({ className, ...props }: SheetHeaderProps) {
  return <HeroDrawerHeader className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

export type SheetTitleProps = ComponentProps<"h2">;
export function SheetTitle({ className, ...props }: SheetTitleProps) {
  return <DrawerHeading className={cn("font-semibold text-foreground", className)} {...props} />;
}

export type SheetDescriptionProps = ComponentProps<"p">;
export function SheetDescription({ className, ...props }: SheetDescriptionProps) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export type SheetFooterProps = ComponentProps<"div">;
export function SheetFooter({ className, ...props }: SheetFooterProps) {
  return (
    <HeroDrawerFooter className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  );
}

export { DrawerBody as SheetBody };

/** Stub — Hero UI Drawer mounts via DrawerBackdrop + DrawerContent, no Portal needed. */
export function SheetPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function SheetOverlay() {
  return null;
}
