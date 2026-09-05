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
      gap={8}
      icons={{
        error: <Icon className="size-4" icon="ph:warning-octagon" />,
        info: <Icon className="size-4" icon="ph:info" />,
        loading: <Icon className="size-4 animate-spin" icon="ph:spinner" />,
        success: <Icon className="size-4" icon="ph:check-circle" />,
        warning: <Icon className="size-4" icon="ph:warning" />,
      }}
      mobileOffset={16}
      offset={16}
      position="top-center"
      style={
        {
          "--border-radius": "12px",
          "--normal-bg": "color-mix(in oklab, var(--background) 88%, transparent)",
          "--normal-border": "color-mix(in oklab, var(--border) 72%, transparent)",
          "--normal-text": "var(--foreground)",
          "--width": "320px",
        } as React.CSSProperties
      }
      theme={theme as ToasterProps["theme"]}
      toastOptions={{
        classNames: {
          actionButton:
            "h-6! rounded-md! border! border-border/60! bg-secondary! px-2.5! text-xs! text-secondary-foreground! hover:bg-secondary/80!",
          cancelButton:
            "h-6! rounded-md! bg-muted! px-2.5! text-xs! text-foreground! hover:bg-muted/80!",
          closeButton:
            "border-border/60 bg-background/90 text-foreground/70 hover:bg-background hover:text-foreground",
          content: "min-w-0 flex-1",
          description: "text-xs! leading-4! text-foreground/70!",
          title: "text-[13px]! font-medium! leading-[18px]! text-foreground!",
          toast:
            "border border-border/70 bg-background/90 text-foreground shadow-md backdrop-blur-xl",
        },
        style: {
          gap: "8px",
          minHeight: "40px",
          padding: "8px 10px",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
