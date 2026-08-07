import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/routes/home-page";
import { SettingsPage } from "@/routes/settings-page";
import { getQueryClient } from "@/lib/query-client";

export interface RouterContext {
  queryClient: QueryClient;
}

const settingsSectionValues = ["appearance", "general"] as const;

function parseSettingsSection(value: unknown): "appearance" | "general" | undefined {
  if (
    typeof value === "string" &&
    settingsSectionValues.includes(value as (typeof settingsSectionValues)[number])
  ) {
    return value as "appearance" | "general";
  }
  return undefined;
}

const settingsSearchSchema = z.object({
  section: z.preprocess(parseSettingsSection, z.enum(settingsSectionValues).optional()),
});

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
});

const indexRoute = createRoute({
  component: HomePage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const settingsRoute = createRoute({
  component: SettingsPage,
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema,
});

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);

/**
 * Hash history is the safe default for Electron:
 * - dev: works with electron-vite HTTP origin
 * - prod: works with file:// packaged loads (no server to rewrite paths)
 */
const hashHistory = createHashHistory();

export function createDesktopRouter(queryClient: QueryClient = getQueryClient()) {
  return createRouter({
    context: { queryClient },
    defaultPreload: "intent",
    history: hashHistory,
    routeTree,
    scrollRestoration: true,
  });
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: DesktopRouter;
  }
}
