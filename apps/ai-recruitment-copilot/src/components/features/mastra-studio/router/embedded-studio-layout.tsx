"use client";

import { ErrorBoundary } from "@mastra/playground-ui/components/ErrorBoundary";
import { PageHeadingContext } from "@mastra/playground-ui/components/PageLayout";
import { Toaster } from "@mastra/playground-ui/components/Toaster";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { AuthRequired } from "@/components/features/mastra-studio/upstream/domains/auth/components/auth-required";
import { ExperimentalUIProvider } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/experimental-ui-context";
import { UI_EXPERIMENTS } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/experiments";
import { useExperimentalUIEnabled } from "@/components/features/mastra-studio/upstream/domains/experimental-ui/use-experimental-ui-enabled";
import { NavigationCommand } from "@/components/features/mastra-studio/upstream/lib/command";
import {
  RouteHeader,
  RouteHeaderActionsProvider,
  RouteHeaderCrumbsProvider,
  getRouteHeaderHeading,
  useRouteHeader,
  useRouteHeaderCrumbsOverride,
} from "@/components/features/mastra-studio/upstream/lib/route-header";
import { useLocation } from "./compat";

function EmbeddedStudioContent({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { crumbs } = useRouteHeader();
  const overrideCrumbs = useRouteHeaderCrumbsOverride();
  const pageHeading = getRouteHeaderHeading(overrideCrumbs ?? crumbs);

  return (
    <>
      <NavigationCommand />
      <div className="flex h-full min-h-0 flex-col">
        <div className="mx-2 mt-1.5 shrink-0">
          <RouteHeader />
        </div>
        <PageHeadingContext.Provider value={pageHeading}>
          <div className="mx-2 mb-2 min-h-0 flex-1 overflow-y-auto rounded-studio-frame border border-border1 bg-surface2 shadow-main-frame [--studio-frame-inset:0.5rem] [--studio-frame-radius:1.5rem]">
            <AuthRequired>
              <ErrorBoundary resetKeys={[pathname]}>{children}</ErrorBoundary>
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
    <div className="h-full min-h-0 bg-surface1 font-sans">
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
