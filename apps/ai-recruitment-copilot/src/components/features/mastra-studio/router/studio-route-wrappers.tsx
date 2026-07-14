"use client";

import { Outlet } from "@tanstack/react-router";
import { AgentLayout } from "@/components/features/mastra-studio/upstream/domains/agents/agent-layout";
import { WorkflowLayout } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow-layout";

export function AgentRouteLayout() {
  return (
    <AgentLayout>
      <Outlet />
    </AgentLayout>
  );
}

export function WorkflowRouteLayout() {
  return (
    <WorkflowLayout>
      <Outlet />
    </WorkflowLayout>
  );
}
