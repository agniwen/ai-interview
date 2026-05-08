"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  AlertDialog as HeroAlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContainer,
  AlertDialogDialog,
  AlertDialogFooter as HeroAlertDialogFooter,
  AlertDialogHeader as HeroAlertDialogHeader,
  AlertDialogHeading,
  AlertDialogTrigger as HeroAlertDialogTrigger,
} from "@heroui/react";
import { buttonClass, type ButtonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type AlertDialogProps = AnyProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  children?: ReactNode;
};

export function AlertDialog({ open, onOpenChange, isOpen, ...props }: AlertDialogProps) {
  return (
    <HeroAlertDialog
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      isOpen={open ?? isOpen}
      onOpenChange={onOpenChange}
    />
  );
}

export type AlertDialogTriggerProps = AnyProps & { asChild?: boolean; children?: ReactNode };
export function AlertDialogTrigger({ asChild: _asChild, ...props }: AlertDialogTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroAlertDialogTrigger {...(props as any)} />;
}

export type AlertDialogContentProps = AnyProps & {
  size?: "default" | "sm";
  children?: ReactNode;
  className?: string;
};
export function AlertDialogContent({
  size = "default",
  children,
  className,
  ...props
}: AlertDialogContentProps) {
  const heroSize = size === "default" ? "md" : "sm";
  return (
    <>
      <AlertDialogBackdrop />
      <AlertDialogContainer size={heroSize}>
        <AlertDialogDialog
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...(props as any)}
          className={cn(
            "group/alert-dialog-content grid gap-4 rounded-lg border border-separator bg-surface p-6 shadow-lg",
            size === "sm" && "max-w-xs",
            className,
          )}
        >
          {children as never}
        </AlertDialogDialog>
      </AlertDialogContainer>
    </>
  );
}

export type AlertDialogHeaderProps = ComponentProps<"div">;
export function AlertDialogHeader({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <HeroAlertDialogHeader
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center sm:place-items-start sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogTitleProps = ComponentProps<"h2">;
export function AlertDialogTitle({ className, ...props }: AlertDialogTitleProps) {
  return <AlertDialogHeading className={cn("text-lg font-semibold", className)} {...props} />;
}

export type AlertDialogDescriptionProps = ComponentProps<"p">;
export function AlertDialogDescription({ className, ...props }: AlertDialogDescriptionProps) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export { AlertDialogBody };

export type AlertDialogFooterProps = ComponentProps<"div">;
export function AlertDialogFooter({ className, ...props }: AlertDialogFooterProps) {
  return (
    <HeroAlertDialogFooter
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export type AlertDialogMediaProps = ComponentProps<"div">;
export function AlertDialogMedia({ className, ...props }: AlertDialogMediaProps) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-default *:[svg:not([class*='size-'])]:size-8",
        className,
      )}
      {...props}
    />
  );
}

/** Action button styled via buttonClass; the close behavior is up to the caller. */
export type AlertDialogActionProps = AnyProps & {
  variant?: ButtonVariants["variant"];
  className?: string;
  children?: ReactNode;
  onClick?: (event: { preventDefault: () => void }) => void;
};
export function AlertDialogAction({
  variant = "primary",
  className,
  ...props
}: AlertDialogActionProps) {
  return (
    <button
      type="button"
      data-slot="alert-dialog-action"
      className={buttonClass({ variant, className })}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
    />
  );
}

export type AlertDialogCancelProps = AnyProps & {
  variant?: ButtonVariants["variant"];
  className?: string;
  children?: ReactNode;
  onClick?: (event: { preventDefault: () => void }) => void;
};
export function AlertDialogCancel({
  variant = "outline",
  className,
  ...props
}: AlertDialogCancelProps) {
  return (
    <button
      type="button"
      data-slot="alert-dialog-cancel"
      className={buttonClass({ variant, className })}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
    />
  );
}

/** Stub — Hero UI mounts the dialog via AlertDialogContainer internally. */
export function AlertDialogPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function AlertDialogOverlay() {
  return null;
}
