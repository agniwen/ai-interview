import "overlayscrollbars/overlayscrollbars.css";
import "./assets/main.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { LazyMotion, domAnimation } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getQueryClient } from "@/lib/query-client";
import { hydrateSettings } from "@/lib/settings";
import type { ThemeMode } from "@/lib/settings";
import { createDesktopRouter } from "@/router";
import { MeetingRecordingProvider } from "@/components/features/meeting/meeting-recording-context";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeSync } from "@/components/theme/theme-sync";

const THEME_VALUES: readonly ThemeMode[] = ["light", "dark", "system"];

function resolveTheme(raw: string | null): ThemeMode {
  return (THEME_VALUES as readonly string[]).includes(raw ?? "") ? (raw as ThemeMode) : "system";
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
}

bootstrapTheme();

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

const queryClient = getQueryClient();
const router = createDesktopRouter(queryClient);

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
      <ThemeSync />
      <LazyMotion features={domAnimation} strict>
        <QueryClientProvider client={queryClient}>
          <MeetingRecordingProvider>
            <RouterProvider router={router} />
          </MeetingRecordingProvider>
        </QueryClientProvider>
      </LazyMotion>
    </ThemeProvider>
  </StrictMode>,
);
