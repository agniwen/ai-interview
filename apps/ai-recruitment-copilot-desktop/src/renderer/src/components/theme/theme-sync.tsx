import { useTheme } from "next-themes";
import { useEffect } from "react";
import type { ThemeMode } from "@/lib/settings";
import { updateSettings } from "@/lib/settings";

/**
 * Mirrors the next-themes selection (which persists to localStorage for
 * flash-free startup) into the main-process settings.json store.
 */
export function ThemeSync(): null {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme) {
      void updateSettings({ theme: theme as ThemeMode });
    }
  }, [theme]);

  return null;
}
