import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppearanceSettingsPage } from "@/components/features/settings/appearance-settings-page";
import { GeneralSettingsPage } from "@/components/features/settings/general-settings-page";
import { SettingsLayout } from "@/components/features/settings/settings-layout";
import { AppShell } from "@/components/layout/app-shell";
import { authClient } from "@/lib/auth-client";
import { getQueryClient } from "@/lib/query-client";
import { AuthCallbackPage } from "@/routes/auth-callback-page";
import { HomePage } from "@/routes/home-page";
import { LoginPage } from "@/routes/login-page";
import { MeetingDetailRoutePage } from "@/routes/meeting-detail-page";
import { MeetingLibraryRoutePage } from "@/routes/meeting-library-page";
import { ResumeDetailRoutePage } from "@/routes/resume-detail-page";

export interface RouterContext {
  queryClient: QueryClient;
}

const loginSearchSchema = z.object({
  error: z.string().optional(),
});

const meetingDetailSearchSchema = z.object({
  at: z.preprocess(
    (value) => (typeof value === "number" && value >= 0 ? value : undefined),
    z.number().nonnegative().optional(),
  ),
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

const meetingLibraryRoute = createRoute({
  component: MeetingLibraryRoutePage,
  getParentRoute: () => appRoute,
  path: "/meetings",
});

function MeetingDetailRouteComponent() {
  const { meetingId } = useParams({ from: "/_app/meetings/$meetingId" });
  const { at } = useSearch({ from: "/_app/meetings/$meetingId" });
  return <MeetingDetailRoutePage meetingId={meetingId} seekToSeconds={at} />;
}

const meetingDetailRoute = createRoute({
  component: MeetingDetailRouteComponent,
  getParentRoute: () => appRoute,
  path: "/meetings/$meetingId",
  validateSearch: meetingDetailSearchSchema,
});

const settingsRoute = createRoute({
  beforeLoad: () => {
    throw redirect({ to: "/settings/general" });
  },
  getParentRoute: () => appRoute,
  path: "/settings",
});

const settingsGeneralRoute = createRoute({
  component: function GeneralSettingsRoutePage() {
    return (
      <SettingsLayout>
        <GeneralSettingsPage />
      </SettingsLayout>
    );
  },
  getParentRoute: () => appRoute,
  path: "/settings/general",
});

const settingsAppearanceRoute = createRoute({
  component: function AppearanceSettingsRoutePage() {
    return (
      <SettingsLayout>
        <AppearanceSettingsPage />
      </SettingsLayout>
    );
  },
  getParentRoute: () => appRoute,
  path: "/settings/appearance",
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authCallbackRoute,
  appRoute.addChildren([
    indexRoute,
    meetingLibraryRoute,
    meetingDetailRoute,
    resumeDetailRoute,
    settingsRoute,
    settingsGeneralRoute,
    settingsAppearanceRoute,
  ]),
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
