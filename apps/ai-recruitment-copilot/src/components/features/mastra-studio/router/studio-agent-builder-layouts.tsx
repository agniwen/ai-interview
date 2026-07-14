"use client";

import { AgentBuilderRootLayout } from "@/components/features/mastra-studio/upstream/domains/agent-builder/layouts/agent-builder-root-layout";
import { studioPaths } from "./studio-paths";

export function AgentBuilderRouteRoot() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <AgentBuilderRootLayout paths={studioPaths} />
    </div>
  );
}
