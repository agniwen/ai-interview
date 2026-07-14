"use client";

import { MastraReactProvider } from "@mastra/react";
import { Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { PostHogProvider } from "@/components/features/mastra-studio/upstream/lib/analytics";
import { PlaygroundQueryClient } from "@/components/features/mastra-studio/upstream/lib/tanstack-query";
import { RoleImpersonationProvider } from "@/components/features/mastra-studio/upstream/domains/auth/context/role-impersonation-context";
import { createFetchWithRefresh } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/fetch-with-refresh";
import { RoutePermissionsGate } from "@/components/features/mastra-studio/upstream/domains/auth/components/route-permissions-gate";
import { PlaygroundConfigGuard } from "@/components/features/mastra-studio/upstream/domains/configuration/components/playground-config-guard";
import { StudioConfigProvider } from "@/components/features/mastra-studio/upstream/domains/configuration/context/studio-config-context";
import { useStudioConfig } from "@/components/features/mastra-studio/upstream/domains/configuration/context/studio-config-state";
import { EMBEDDED_MASTRA_API_PREFIX } from "@/components/features/mastra-studio/mastra-studio-config";
import { MastraStudioRouteSkeleton } from "./mastra-studio-route-skeleton";
import { ScopedMastraTheme } from "./scoped-mastra-theme";
import "@mastra/playground-ui/style.css";
import "../mastra-studio.css";

function ConnectedStudio() {
  const { apiPrefix, baseUrl, headers, isLoading } = useStudioConfig();
  const customFetch = useMemo(
    () => (baseUrl ? createFetchWithRefresh(baseUrl, apiPrefix) : undefined),
    [apiPrefix, baseUrl],
  );
  const studioHeaders = useMemo(
    () => ({ ...headers, "x-mastra-client-type": "studio" }),
    [headers],
  );

  if (isLoading) {
    return <MastraStudioRouteSkeleton />;
  }
  if (!baseUrl) {
    return <PlaygroundConfigGuard />;
  }

  return (
    <MastraReactProvider
      apiPrefix={apiPrefix}
      baseUrl={baseUrl}
      customFetch={customFetch}
      headers={studioHeaders}
    >
      <RoleImpersonationProvider>
        <PostHogProvider>
          <RoutePermissionsGate baseUrl={baseUrl}>
            <Outlet />
          </RoutePermissionsGate>
        </PostHogProvider>
      </RoleImpersonationProvider>
    </MastraReactProvider>
  );
}

export function MastraStudioRouteRoot() {
  return (
    <div className="mastra-studio-root h-full min-h-0 overflow-hidden [&_.h-screen]:h-full [&_.min-h-screen]:min-h-full [&_.w-screen]:w-full">
      <ScopedMastraTheme>
        <PlaygroundQueryClient>
          <StudioConfigProvider
            defaultApiPrefix={EMBEDDED_MASTRA_API_PREFIX}
            endpoint={window.location.origin}
          >
            <ConnectedStudio />
          </StudioConfigProvider>
        </PlaygroundQueryClient>
      </ScopedMastraTheme>
    </div>
  );
}
