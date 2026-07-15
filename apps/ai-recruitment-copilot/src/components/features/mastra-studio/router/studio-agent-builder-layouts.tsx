"use client";

import { AgentBuilderRootLayout } from "@/components/features/mastra-studio/upstream/domains/agent-builder/layouts/agent-builder-root-layout";
import { MastraStudioHeader } from "./mastra-studio-header";
import { studioPaths } from "./studio-paths";

export function AgentBuilderRouteRoot() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <MastraStudioHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentBuilderRootLayout paths={studioPaths} />
      </div>
    </div>
  );
}
