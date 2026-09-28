"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
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
  const { resolvedTheme, forcedTheme } = useTheme();
  const effectiveTheme = forcedTheme ?? resolvedTheme;

  useEffect(() => {
    if (effectiveTheme === "dark" || effectiveTheme === "light") {
      syncThemeFavicon(effectiveTheme);
      void writeThemeCookie(effectiveTheme);
    }
  }, [effectiveTheme]);

  return null;
}

const SystemThemeOverrideContext = createContext<((enabled: boolean) => void) | null>(null);

function subscribeSystemTheme(listener: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerSystemTheme() {
  return "light";
}

/** Temporarily follow the system without overwriting the saved theme preference. */
export function useSystemThemeOverride(enabled: boolean) {
  const setOverride = useContext(SystemThemeOverrideContext);
  useEffect(() => {
    if (!enabled || !setOverride) {
      return;
    }
    setOverride(true);
    return () => setOverride(false);
  }, [enabled, setOverride]);
}

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  const [systemOverride, setSystemOverride] = useState(false);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  );
  return (
    <SystemThemeOverrideContext value={setSystemOverride}>
      <NextThemesProvider {...props} forcedTheme={systemOverride ? systemTheme : props.forcedTheme}>
        <ThemeCookieSync />
        {children}
      </NextThemesProvider>
    </SystemThemeOverrideContext>
  );
}
