"use client";

import { useEffect } from "react";
import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { writeThemeCookie } from "@/lib/client/theme-cookie";

interface FaviconRoot {
  querySelector: (selector: string) => { media: string } | null;
}

function getBrowserFaviconRoot(): FaviconRoot {
  return {
    querySelector: (selector) => document.querySelector<HTMLLinkElement>(selector),
  };
}

export function syncThemeFavicon(resolvedTheme: "dark" | "light", root?: FaviconRoot) {
  const faviconRoot = root ?? getBrowserFaviconRoot();
  const lightFavicon = faviconRoot.querySelector("#favicon-light");
  const darkFavicon = faviconRoot.querySelector("#favicon-dark");

  if (lightFavicon) {
    lightFavicon.media = resolvedTheme === "light" ? "all" : "not all";
  }
  if (darkFavicon) {
    darkFavicon.media = resolvedTheme === "dark" ? "all" : "not all";
  }
}

function ThemeCookieSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme === "dark" || resolvedTheme === "light") {
      syncThemeFavicon(resolvedTheme);
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
