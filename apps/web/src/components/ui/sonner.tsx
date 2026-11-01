"use client";

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
} from "@tabler/icons-react";
import type { ToasterProps } from "sonner";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      icons={{
        error: <IconAlertOctagon className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        loading: <IconLoader2 className="size-4 animate-spin" />,
        success: <IconCircleCheck className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
      }}
      style={
        {
          "--border-radius": "12px",
          "--normal-bg": "var(--popover)",
          "--normal-border": "transparent",
          "--normal-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      // Sonner styles toasts through [data-styled] attribute selectors, so overrides need `!`.
      toastOptions={{
        classNames: {
          actionButton:
            "h-7! rounded-lg! bg-primary! px-2.5! text-primary-foreground! hover:bg-primary/90!",
          cancelButton:
            "h-7! rounded-lg! bg-component! px-2.5! text-foreground! hover:bg-component-hover!",
          closeButton:
            "border-transparent! bg-popover! text-muted-foreground! shadow-default! hover:text-foreground!",
          description: "text-muted-foreground!",
          title: "font-medium text-foreground",
          toast: "gap-2! px-3.5! py-3! shadow-large!",
        },
      }}
      position="top-center"
      theme={theme as ToasterProps["theme"]}
      {...props}
    />
  );
}

export { Toaster };
