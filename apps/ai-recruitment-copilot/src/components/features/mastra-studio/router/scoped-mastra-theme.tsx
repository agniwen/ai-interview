"use client";

import {
  ThemeProvider as MastraThemeProvider,
  useTheme as useMastraTheme,
} from "@mastra/playground-ui/components/ThemeProvider";
import { PortalContainerProvider } from "@mastra/playground-ui/primitives/portal-container";
import { useTheme as useHostTheme } from "next-themes";
import { useLayoutEffect, useState } from "react";

type ResolvedTheme = "dark" | "light";

function MastraThemeSynchronizer({ theme }: { theme: ResolvedTheme }) {
  const { resolvedTheme, setTheme } = useMastraTheme();

  useLayoutEffect(() => {
    if (resolvedTheme !== theme) {
      setTheme(theme);
    }
  }, [resolvedTheme, setTheme, theme]);

  return null;
}

export function ScopedMastraTheme({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useHostTheme();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const studioTheme: ResolvedTheme = resolvedTheme === "light" ? "light" : "dark";

  return (
    <div className="mastra-studio-theme h-full min-h-0" ref={setTarget}>
      {target ? (
        <MastraThemeProvider defaultTheme={studioTheme} storageKey="theme" target={target}>
          <MastraThemeSynchronizer theme={studioTheme} />
          <PortalContainerProvider container={target}>{children}</PortalContainerProvider>
        </MastraThemeProvider>
      ) : null}
    </div>
  );
}
