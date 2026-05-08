"use client";

import {
  Alert as HeroAlert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  AlertTitle,
  type AlertProps as HeroAlertProps,
} from "@heroui/react";

type LegacyVariant = "default" | "destructive";

export type AlertProps = Omit<HeroAlertProps, "status"> & {
  status?: HeroAlertProps["status"];
  /** Legacy alias (shadcn). Maps to `status`. */
  variant?: LegacyVariant | HeroAlertProps["status"];
};

export function Alert({ status, variant, ...props }: AlertProps) {
  const heroStatus: HeroAlertProps["status"] =
    status ??
    (variant === "destructive"
      ? "danger"
      : variant === "default"
        ? undefined
        : (variant as HeroAlertProps["status"]));
  return <HeroAlert status={heroStatus} {...props} />;
}

export { AlertContent, AlertDescription, AlertIndicator, AlertTitle };
