import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";
import type * as React from "react";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";

const alertVariants = cva(
  "relative grid w-full items-start gap-x-2 gap-y-0.5 rounded-xl border px-3.5 py-3 text-card-foreground text-sm has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*4)_1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-data-[slot=alert-action]:grid-cols-[1fr_auto] has-[>svg]:gap-x-2 [&>svg]:h-lh [&>svg]:w-4",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "bg-transparent dark:bg-input/32 [&>svg]:text-muted-foreground",
        error: "border-destructive/32 bg-destructive/4 [&>svg]:text-destructive",
        info: "border-info/32 bg-info/4 [&>svg]:text-info",
        success: "border-success/32 bg-success/4 [&>svg]:text-success",
        warning: "border-warning/32 bg-warning/4 [&>svg]:text-warning",
      },
    },
  },
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const AlertVariantContext = createContext<AlertVariant>("default");

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>): React.ReactElement {
  const resolvedVariant = variant ?? "default";
  return (
    <AlertVariantContext.Provider value={resolvedVariant}>
      <div
        className={cn(alertVariants({ variant: resolvedVariant }), className)}
        data-slot="alert"
        data-variant={resolvedVariant}
        role="alert"
        {...props}
      />
    </AlertVariantContext.Provider>
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("font-medium [svg~&]:col-start-2", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex flex-col gap-2.5 text-muted-foreground [svg~&]:col-start-2", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

export function AlertAction({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex gap-1 max-sm:col-start-2 max-sm:mt-2 sm:row-start-1 sm:row-end-3 sm:self-center sm:[[data-slot=alert-description]~&]:col-start-2 sm:[[data-slot=alert-title]~&]:col-start-2 sm:[svg~&]:col-start-2 sm:[svg~[data-slot=alert-description]~&]:col-start-3 sm:[svg~[data-slot=alert-title]~&]:col-start-3",
        className,
      )}
      data-slot="alert-action"
      {...props}
    />
  );
}

const alertActionButtonVariants = cva("border-transparent shadow-none hover:border-transparent", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "text-foreground hover:bg-accent hover:text-accent-foreground",
      error:
        "bg-destructive/8 text-destructive hover:bg-destructive/16 hover:text-destructive dark:bg-destructive/12 dark:hover:bg-destructive/20",
      info: "bg-info/8 text-info hover:bg-info/16 hover:text-info dark:bg-info/12 dark:hover:bg-info/20",
      success:
        "bg-success/8 text-success hover:bg-success/16 hover:text-success dark:bg-success/12 dark:hover:bg-success/20",
      warning:
        "bg-warning/8 text-warning hover:bg-warning/16 hover:text-warning dark:bg-warning/12 dark:hover:bg-warning/20",
    },
  },
});

export function AlertActionButton({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant">): React.ReactElement {
  const variant = useContext(AlertVariantContext);
  return (
    <Button
      className={cn(alertActionButtonVariants({ variant }), className)}
      data-slot="alert-action-button"
      variant="ghost"
      {...props}
    />
  );
}
