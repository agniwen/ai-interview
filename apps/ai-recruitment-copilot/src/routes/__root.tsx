import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import "overlayscrollbars/overlayscrollbars.css";
import "../styles/globals.css";
import { NotFoundPage } from "@/components/layout/not-found-view";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OverlayScrollbarsBody } from "@/components/layout/overlay-scrollbars-body";
import type { getQueryClient } from "@/lib/client/query-client";
import { AppWatermark } from "@/components/features/watermark/app-watermark";
import { env } from "@/env/client";
import { ROOT_DOCUMENT_TITLE, documentTitleMeta } from "@/lib/start/document-title";
import { resolveForcedPageTheme } from "@/lib/client/fixed-page-theme";
import { getLocale, getTextDirection } from "@/paraglide/runtime";

const ROOT_DESCRIPTION =
  "面向招聘团队的 AI 协同工作台，覆盖简历筛选、AI 面试、真人复面与候选人决策全流程。AI Recruitment Copilot — one connected hiring workflow.";
const ROOT_OG_IMAGE_URL = new URL("/og.png", env.NEXT_PUBLIC_BASE_URL).toString();

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      data-overlayscrollbars-initialize=""
      dir={getTextDirection()}
      lang={getLocale()}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body data-overlayscrollbars-initialize="" className="min-h-dvh antialiased">
        <OverlayScrollbarsBody />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const forcedTheme = resolveForcedPageTheme(pathname);
  const {
    options: {
      context: { queryClient },
    },
  } = useRouter();

  return (
    <RootDocument>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            disableTransitionOnChange
            enableSystem
            forcedTheme={forcedTheme}
          >
            <QueryProvider queryClient={queryClient}>
              <TooltipProvider>
                <Outlet />
                <AppWatermark />
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </LazyMotion>
      </MotionConfig>
    </RootDocument>
  );
}

function RootNotFoundComponent() {
  return <NotFoundPage />;
}

export const Route = createRootRouteWithContext<{
  queryClient: ReturnType<typeof getQueryClient>;
}>()({
  component: RootComponent,
  head: ({ matches }) => ({
    links: [
      { href: "/favicon.ico", rel: "icon" },
      {
        crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net",
        rel: "preconnect",
      },
      {
        crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Regular.min.css",
        rel: "stylesheet",
      },
      {
        crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Medium.min.css",
        rel: "stylesheet",
      },
      {
        crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Semibold.min.css",
        rel: "stylesheet",
      },
      {
        crossOrigin: "anonymous",
        href: "https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Bold.min.css",
        rel: "stylesheet",
      },
    ],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
        name: "viewport",
      },
      {
        content: ROOT_DESCRIPTION,
        name: "description",
      },
      { content: ROOT_DOCUMENT_TITLE, property: "og:title" },
      { content: ROOT_DESCRIPTION, property: "og:description" },
      { content: "website", property: "og:type" },
      { content: ROOT_OG_IMAGE_URL, property: "og:image" },
      { content: "1200", property: "og:image:width" },
      { content: "630", property: "og:image:height" },
      { content: "summary_large_image", name: "twitter:card" },
      { content: ROOT_DOCUMENT_TITLE, name: "twitter:title" },
      { content: ROOT_DESCRIPTION, name: "twitter:description" },
      { content: ROOT_OG_IMAGE_URL, name: "twitter:image" },
      {
        content: "#ffffff",
        media: "(prefers-color-scheme: light)",
        name: "theme-color",
      },
      {
        content: "#0a0a0a",
        media: "(prefers-color-scheme: dark)",
        name: "theme-color",
      },
      ...documentTitleMeta(matches),
    ],
  }),
  notFoundComponent: RootNotFoundComponent,
});
