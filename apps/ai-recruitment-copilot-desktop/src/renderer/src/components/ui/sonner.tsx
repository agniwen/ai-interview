"use client";

import type { ToasterProps } from "sonner";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { Icon } from "@/components/ui/icon";

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      icons={{
        error: <Icon className="size-4" icon="ph:warning-octagon" />,
        info: <Icon className="size-4" icon="ph:info" />,
        loading: <Icon className="size-4 animate-spin" icon="ph:spinner" />,
        success: <Icon className="size-4" icon="ph:check-circle" />,
        warning: <Icon className="size-4" icon="ph:warning" />,
      }}
      position="top-center"
      style={
        {
          "--border-radius": "18px",
          "--normal-bg": "color-mix(in oklab, white 78%, transparent)",
          "--normal-border": "color-mix(in oklab, white 52%, var(--border))",
          "--normal-text": "oklch(0.24 0.02 248)",
        } as React.CSSProperties
      }
      theme={theme as ToasterProps["theme"]}
      toastOptions={{
        classNames: {
          actionButton:
            "rounded-full border border-border/60 bg-white/80 px-3 text-foreground hover:bg-white",
          cancelButton: "bg-black/5 text-foreground hover:bg-black/10",
          closeButton:
            "border-white/50 bg-white/70 text-foreground/70 hover:bg-white hover:text-foreground",
          description: "text-foreground/75",
          title: "font-medium text-foreground",
          toast:
            "border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-xl",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
