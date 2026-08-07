import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { authClient } from "@/lib/auth-client";
import { getQueryClient } from "@/lib/query-client";
import { AuthCallbackPage } from "@/routes/auth-callback-page";
import { HomePage } from "@/routes/home-page";
import { LoginPage } from "@/routes/login-page";
import { ResumeDetailRoutePage } from "@/routes/resume-detail-page";
import { SettingsPage } from "@/routes/settings-page";

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

const loginSearchSchema = z.object({
  error: z.string().optional(),
});

async function requireSession() {
  const session = await authClient.getSession();
  if (!session.data) {
    throw redirect({ to: "/login" });
  }
  return session.data;
}

async function redirectIfAuthenticated() {
  const session = await authClient.getSession();
  if (session.data) {
    throw redirect({ to: "/" });
  }
}

/** Root: no chrome — login stays bare; app routes mount AppShell themselves. */
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    return <Outlet />;
  },
});

const loginRoute = createRoute({
  beforeLoad: redirectIfAuthenticated,
  component: LoginPage,
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: loginSearchSchema,
});

const authCallbackRoute = createRoute({
  component: AuthCallbackPage,
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
});

/** Authenticated app shell with sidebar chrome. */
const appRoute = createRoute({
  beforeLoad: requireSession,
  component: function AppLayout() {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
  getParentRoute: () => rootRoute,
  id: "/_app",
});

const indexRoute = createRoute({
  component: HomePage,
  getParentRoute: () => appRoute,
  path: "/",
});

const resumeDetailRoute = createRoute({
  component: ResumeDetailRoutePage,
  getParentRoute: () => appRoute,
  path: "/resumes/$recordId",
});

const settingsRoute = createRoute({
  component: SettingsPage,
  getParentRoute: () => appRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authCallbackRoute,
  appRoute.addChildren([indexRoute, resumeDetailRoute, settingsRoute]),
]);

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
