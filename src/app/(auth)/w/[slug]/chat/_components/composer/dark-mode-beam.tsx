"use client";

import { BorderBeam } from "border-beam";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

interface DarkModeBeamProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps children in an animated BorderBeam only in dark mode + only while
 * `active` is true. Light mode degrades to a transparent passthrough so the
 * DOM diff between modes is just "extra wrapper div, no overlays".
 */
export function DarkModeBeam({ active, children, className }: DarkModeBeamProps) {
  const { resolvedTheme } = useTheme();
  const isHydrated = useHydrated();
  const isDark = isHydrated && resolvedTheme === "dark";

  if (!isDark) {
    return <div className={className}>{children}</div>;
  }

  return (
    <BorderBeam
      active={active}
      borderRadius={21}
      className={className}
      colorVariant="ocean"
      size="md"
      strength={0.7}
      theme="dark"
    >
      {children}
    </BorderBeam>
  );
}
