"use client";

import type { ComponentProps } from "react";
import { Kbd, type KbdProps } from "@heroui/react";
import { cn } from "@/lib/utils";

export { Kbd, type KbdProps };

export function KbdGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}
