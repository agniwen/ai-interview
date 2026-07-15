"use client";

import { Outlet } from "@tanstack/react-router";
import { Toaster } from "@mastra/playground-ui/components/Toaster";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { AuthRequired } from "@/components/features/mastra-studio/upstream/domains/auth/components/auth-required";
import { RoutePermissionGuard } from "@/components/features/mastra-studio/upstream/domains/auth/components/route-permission-guard";
import { LinkComponentProvider } from "@/components/features/mastra-studio/upstream/lib/framework";
import { Link } from "@/components/features/mastra-studio/upstream/lib/link";
import { useNavigate } from "./compat";
import { EmbeddedStudioLayout } from "./embedded-studio-layout";
import { MastraStudioHeader } from "./mastra-studio-header";
import { studioPaths } from "./studio-paths";

function StudioLinkProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <LinkComponentProvider
      Link={Link}
      navigate={(path) => void navigate(path, { viewTransition: true })}
      paths={studioPaths}
    >
      {children}
    </LinkComponentProvider>
  );
}

export function MastraStudioMainLayout() {
  return (
    <StudioLinkProvider>
      <EmbeddedStudioLayout>
        <RoutePermissionGuard>
          <Outlet />
        </RoutePermissionGuard>
      </EmbeddedStudioLayout>
    </StudioLinkProvider>
  );
}

export function MastraStudioMinimalLayout() {
  return (
    <StudioLinkProvider>
      <div className="flex h-full min-h-0 flex-col bg-background font-sans">
        <Toaster position="bottom-right" />
        <TooltipProvider delayDuration={0}>
          <MastraStudioHeader />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AuthRequired>
              <Outlet />
            </AuthRequired>
          </div>
        </TooltipProvider>
      </div>
    </StudioLinkProvider>
  );
}
