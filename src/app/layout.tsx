import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "overlayscrollbars/overlayscrollbars.css";
import { Suspense } from "react";
import { OverlayScrollbarsBody } from "@/components/overlay-scrollbars-body";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["400", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  description:
    "面向招聘场景的 AI 协同工作台，覆盖简历筛选、模拟面试与候选人评估全流程。AI Recruitment Copilot — your end-to-end hiring workflow.",
  title: "招聘 AI 协同工作台 · AI Recruitment Copilot",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

const isVercelAnalyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 通过 jsDelivr 加载小米 MiSans 中英文字体（4 档常用字重）。
            Load MiSans CJK + Latin webfont via jsDelivr CDN (4 common weights). */}
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Regular.min.css"
          rel="stylesheet"
        />
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Medium.min.css"
          rel="stylesheet"
        />
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Semibold.min.css"
          rel="stylesheet"
        />
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Bold.min.css"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${sourceSans.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} min-h-dvh antialiased`}
      >
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
          href="#main-content"
        >
          跳到主要内容
        </a>
        <OverlayScrollbarsBody />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <NuqsAdapter>
            <QueryProvider>
              <TooltipProvider>
                <Suspense>{children}</Suspense>
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </NuqsAdapter>
        </ThemeProvider>
        {isVercelAnalyticsEnabled ? <Analytics /> : null}
      </body>
    </html>
  );
}
