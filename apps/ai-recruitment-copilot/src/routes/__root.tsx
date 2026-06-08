import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import appCss from "../styles/globals.css?url";
import overlayScrollbarsCss from "overlayscrollbars/overlayscrollbars.css?url";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OverlayScrollbarsBody } from "@/components/layout/overlay-scrollbars-body";

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
          href="#main-content"
        >
          跳到主要内容
        </a>
        <OverlayScrollbarsBody />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
        <NuqsAdapter>
          <QueryProvider>
            <TooltipProvider>
              <Outlet />
              <Toaster />
            </TooltipProvider>
          </QueryProvider>
        </NuqsAdapter>
      </ThemeProvider>
    </RootDocument>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    links: [
      { href: "/favicon.ico", rel: "icon" },
      { href: appCss, rel: "stylesheet" },
      { href: overlayScrollbarsCss, rel: "stylesheet" },
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
});
