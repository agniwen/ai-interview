"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Modal as HeroModal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalTrigger,
} from "@heroui/react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type DialogProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  children?: ReactNode;
};
export function Dialog({ open, onOpenChange, isOpen, ...props }: DialogProps) {
  return (
    <HeroModal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isOpen={open ?? isOpen}
      onOpenChange={onOpenChange}
    />
  );
}

export const DialogTrigger = ModalTrigger;

export type DialogContentProps = AnyProps & { children?: ReactNode; className?: string };
export function DialogContent({ children, className, ...props }: DialogContentProps) {
  return (
    <>
      <ModalBackdrop />
      <ModalContainer>
        <ModalDialog
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...(props as any)}
          className={cn("flex max-h-[90vh] flex-col overflow-hidden", className)}
        >
          {children as never}
        </ModalDialog>
      </ModalContainer>
    </>
  );
}

export type DialogHeaderProps = ComponentProps<"div">;
export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <ModalHeader
      className={cn(
        "flex shrink-0 flex-col gap-1.5 border-b border-separator px-6 pt-5 pb-4",
        className,
      )}
      {...props}
    />
  );
}

export type DialogTitleProps = ComponentProps<"h2">;
export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <ModalHeading
      className={cn("text-lg leading-none font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = ComponentProps<"p">;
export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return <p className={cn("text-muted text-sm", className)} {...props} />;
}

export type DialogBodyProps = ComponentProps<"div">;
export function DialogBody({ className, ...props }: DialogBodyProps) {
  return (
    <ModalBody className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)} {...props} />
  );
}

export type DialogFooterProps = ComponentProps<"div"> & {
  showCloseButton?: boolean;
};
export function DialogFooter({
  className,
  showCloseButton: _showCloseButton,
  ...props
}: DialogFooterProps) {
  return (
    <ModalFooter
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-separator px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DialogClose({ children, className }: AnyProps) {
  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
}

export function DialogPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function DialogOverlay() {
  return null;
}
