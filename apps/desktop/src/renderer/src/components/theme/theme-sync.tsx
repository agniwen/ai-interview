import { useTheme } from "next-themes";
import { useEffect } from "react";
import { updateSettings } from "@/lib/settings";
import { themeModeSchema } from "../../../../preload/orpc-contract";

/**
 * Mirrors the next-themes selection (which persists to localStorage for
 * flash-free startup) into the main-process settings.json store.
 */
export function ThemeSync(): null {
  const { theme } = useTheme();

  useEffect(() => {
    const parsedTheme = themeModeSchema.safeParse(theme);
    if (parsedTheme.success) {
      void updateSettings({ theme: parsedTheme.data });
    }
  }, [theme]);

  return null;
}
