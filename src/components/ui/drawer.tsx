"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Drawer as HeroDrawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent as HeroDrawerContent,
  DrawerFooter as HeroDrawerFooter,
  DrawerHeader as HeroDrawerHeader,
  DrawerHeading,
  DrawerTrigger as HeroDrawerTrigger,
} from "@heroui/react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type DrawerProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  /** Legacy vaul direction; mapped to Hero UI placement. */
  direction?: "top" | "bottom" | "left" | "right";
  children?: ReactNode;
};

export function Drawer({ open, onOpenChange, isOpen, direction, ...props }: DrawerProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <HeroDrawer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isOpen={open ?? isOpen}
      onOpenChange={onOpenChange}
      placement={direction}
    />
  );
}

export const DrawerTrigger = HeroDrawerTrigger;

export type DrawerContentProps = AnyProps & { children?: ReactNode; className?: string };
export function DrawerContent({ children, className, ...props }: DrawerContentProps) {
  return (
    <DrawerBackdrop>
      <HeroDrawerContent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(props as any)}
        className={className}
      >
        {children as never}
      </HeroDrawerContent>
    </DrawerBackdrop>
  );
}

export type DrawerHeaderProps = ComponentProps<"div">;
export function DrawerHeader({ className, ...props }: DrawerHeaderProps) {
  return (
    <HeroDrawerHeader
      className={cn("flex flex-col gap-1 p-4 md:gap-1.5 md:text-left", className)}
      {...props}
    />
  );
}

export type DrawerTitleProps = ComponentProps<"h2">;
export function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return <DrawerHeading className={cn("font-semibold text-foreground", className)} {...props} />;
}

export type DrawerDescriptionProps = ComponentProps<"p">;
export function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export type DrawerFooterProps = ComponentProps<"div">;
export function DrawerFooter({ className, ...props }: DrawerFooterProps) {
  return (
    <HeroDrawerFooter className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  );
}

export { DrawerBody };

/** Legacy stubs for shadcn callers. */
export function DrawerPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function DrawerOverlay() {
  return null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DrawerClose({ children, className }: AnyProps) {
  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
}
