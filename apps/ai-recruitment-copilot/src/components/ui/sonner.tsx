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
          "--border-radius": "18px",
          "--normal-bg": "color-mix(in oklab, white 78%, transparent)",
          "--normal-border": "color-mix(in oklab, white 52%, var(--border))",
          "--normal-text": "oklch(0.24 0.02 248)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          actionButton: "bg-white/80 text-foreground hover:bg-white",
          cancelButton: "bg-black/5 text-foreground hover:bg-black/10",
          closeButton:
            "border-white/50 bg-white/70 text-foreground/70 hover:bg-white hover:text-foreground",
          description: "text-foreground/75",
          title: "font-medium text-foreground",
          toast:
            "border border-white/55 bg-white/68 text-foreground shadow-[0_18px_48px_-26px_rgba(36,62,110,0.35)] backdrop-blur-xl",
        },
      }}
      position="top-center"
      theme={theme as ToasterProps["theme"]}
      {...props}
    />
  );
}

export { Toaster };
