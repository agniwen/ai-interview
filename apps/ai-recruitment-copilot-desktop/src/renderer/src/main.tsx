import "overlayscrollbars/overlayscrollbars.css";
import "./assets/main.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { Provider as JotaiProvider } from "jotai";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { themeModeSchema } from "../../preload/orpc-contract";
import { getQueryClient } from "@/lib/query-client";
import { getSettings, hydrateSettings, useSettings } from "@/lib/settings";
import type { ThemeMode } from "@/lib/settings";
import { createDesktopRouter } from "@/router";
import { AppErrorBoundary } from "@/components/layout/app-error-boundary";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeSync } from "@/components/theme/theme-sync";
import { meetingRecordingStore } from "@/components/features/meeting/meeting-recording-store";
import { initializeMeetingRecordingStore } from "@/components/features/meeting/meeting-recording-store-init";

function resolveTheme(raw: string | null): ThemeMode {
  return themeModeSchema.safeParse(raw).data ?? "system";
}

/**
 * Pre-paint theme bootstrap.
 *
 * next-themes persists the selection to localStorage and its own flash
 * prevention relies on an inline <script> that our CSP (`script-src 'self'`)
 * blocks — so we seed the class + localStorage here, synchronously, before
 * React renders. next-themes takes over from mount on: it resolves `theme`
 * from localStorage and keeps the class in sync, while `ThemeSync` mirrors
 * every change back to the main-process settings.json via oRPC.
 */
function bootstrapTheme(): void {
  const savedTheme = resolveTheme(localStorage.getItem("theme"));
  const html = document.documentElement;
  try {
    localStorage.setItem("theme", savedTheme);
  } catch {
    // localStorage unavailable — next-themes' defaultTheme still applies.
  }
  let resolved: "light" | "dark";
  if (savedTheme === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    resolved = savedTheme;
  }
  html.classList.toggle("dark", resolved === "dark");
  // Used by CSS to fall back to solid sidebar on Linux (no OS acrylic).
  html.classList.add(`platform-${window.api.window.platform}`);
  html.dataset.transparentBackground = String(getSettings().transparentBackground);
}

function WindowBackgroundSync(): null {
  const { transparentBackground } = useSettings();
  useEffect(() => {
    document.documentElement.dataset.transparentBackground = String(transparentBackground);
  }, [transparentBackground]);
  return null;
}

bootstrapTheme();

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

const queryClient = getQueryClient();
const router = createDesktopRouter(queryClient);
initializeMeetingRecordingStore();

// Fire-and-forget: settings.json values hydrate into the store shortly after;
// the theme is already applied above from localStorage.
void hydrateSettings();

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme={resolveTheme(localStorage.getItem("theme"))}
      disableTransitionOnChange
      enableSystem
    >
      <AppErrorBoundary>
        <ThemeSync />
        <WindowBackgroundSync />
        <MotionConfig reducedMotion="user">
          <LazyMotion features={domAnimation} strict>
            <JotaiProvider store={meetingRecordingStore}>
              <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
              </QueryClientProvider>
            </JotaiProvider>
          </LazyMotion>
        </MotionConfig>
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
