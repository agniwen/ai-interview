"use client";

import { useEffect } from "react";
import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { writeThemeCookie } from "@/lib/client/theme-cookie";

function ThemeCookieSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme === "dark" || resolvedTheme === "light") {
      void writeThemeCookie(resolvedTheme);
    }
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeCookieSync />
      {children}
    </NextThemesProvider>
  );
}
