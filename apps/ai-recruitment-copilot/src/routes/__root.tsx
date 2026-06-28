import type { ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
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

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh antialiased">
        <OverlayScrollbarsBody />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const {
    options: {
      context: { queryClient },
    },
  } = useRouter();

  return (
    <RootDocument>
      <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
        <QueryProvider queryClient={queryClient}>
          <TooltipProvider>
            <Outlet />
            <AppWatermark />
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </ThemeProvider>
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
  head: () => ({
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
        content:
          "面向招聘场景的 AI 协同工作台，覆盖简历筛选、模拟面试与候选人评估全流程。AI Recruitment Copilot — your end-to-end hiring workflow.",
        name: "description",
      },
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
      { title: "招聘 AI 协同工作台 · AI Recruitment Copilot" },
    ],
  }),
  notFoundComponent: RootNotFoundComponent,
});
