"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorBoundary } from "@mastra/playground-ui/components/ErrorBoundary";
import type { ErrorBoundaryFallbackProps } from "@mastra/playground-ui/components/ErrorBoundary";
import { PageHeadingContext } from "@mastra/playground-ui/components/PageLayout";
import { Toaster } from "@mastra/playground-ui/components/Toaster";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { AlertTriangle } from "lucide-react";
import { AuthRequired } from "@/components/features/mastra-studio/upstream/domains/auth/components/auth-required";
import { ExperimentalUIProvider } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/experimental-ui-context";
import { UI_EXPERIMENTS } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/experiments";
import { useExperimentalUIEnabled } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/use-experimental-ui-enabled";
import { NavigationCommand } from "@/components/features/mastra-studio/upstream/lib/command";
import {
  RouteHeaderActionsProvider,
  RouteHeaderCrumbsProvider,
  getRouteHeaderHeading,
  useRouteHeader,
  useRouteHeaderCrumbsOverride,
} from "@/components/features/mastra-studio/upstream/lib/route-header";
import { useLocation } from "./compat";
import { MastraStudioHeader } from "./mastra-studio-header";

function StudioErrorFallback({ error, errorInfo, reset }: ErrorBoundaryFallbackProps) {
  const stack = errorInfo?.componentStack ?? error.stack;

  return (
    <div
      role="alert"
      className="flex h-full min-h-60 w-full items-center justify-center px-6 py-10"
    >
      <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent2/10 text-accent2">
          <AlertTriangle className="size-7" />
        </div>
        <h3 className="text-ui-lg font-medium text-neutral6">页面加载失败</h3>
        <p className="text-ui-md text-neutral3">渲染此页面时发生了意外错误。</p>
        <p className="break-words rounded-md bg-surface3 px-3 py-2 font-mono text-ui-sm text-neutral4">
          {error.message}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="lg" onClick={reset}>
            重试
          </Button>
          <Button variant="default" size="lg" onClick={() => window.location.reload()}>
            重新加载页面
          </Button>
          <Button
            as="a"
            variant="default"
            size="lg"
            href="https://github.com/mastra-ai/mastra/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            报告问题
          </Button>
        </div>
        {stack ? (
          <details className="mt-2 w-full text-left">
            <summary className="cursor-pointer text-ui-sm text-neutral3 hover:text-neutral4">
              查看错误详情
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface3 p-3 text-ui-xs text-neutral4">
              {stack}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function EmbeddedStudioContent({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { crumbs } = useRouteHeader();
  const overrideCrumbs = useRouteHeaderCrumbsOverride();
  const pageHeading = getRouteHeaderHeading(overrideCrumbs ?? crumbs);

  return (
    <>
      <NavigationCommand />
      <div className="flex h-full min-h-0 flex-col">
        <MastraStudioHeader />
        <PageHeadingContext.Provider value={pageHeading}>
          <div className="m-2 min-h-0 flex-1 overflow-y-auto rounded-studio-frame bg-background [--studio-frame-inset:0.5rem] [--studio-frame-radius:1.5rem]">
            <AuthRequired>
              <ErrorBoundary resetKeys={[pathname]} fallback={StudioErrorFallback}>
                {children}
              </ErrorBoundary>
            </AuthRequired>
          </div>
        </PageHeadingContext.Provider>
      </div>
    </>
  );
}

export function EmbeddedStudioLayout({ children }: { children: React.ReactNode }) {
  const { experimentalUIEnabled } = useExperimentalUIEnabled();

  return (
    <div className="h-full min-h-0 bg-background font-sans">
      <Toaster position="bottom-right" />
      <TooltipProvider delayDuration={0}>
        <ExperimentalUIProvider experiments={experimentalUIEnabled ? UI_EXPERIMENTS : []}>
          <RouteHeaderActionsProvider>
            <RouteHeaderCrumbsProvider>
              <EmbeddedStudioContent>{children}</EmbeddedStudioContent>
            </RouteHeaderCrumbsProvider>
          </RouteHeaderActionsProvider>
        </ExperimentalUIProvider>
      </TooltipProvider>
    </div>
  );
}
