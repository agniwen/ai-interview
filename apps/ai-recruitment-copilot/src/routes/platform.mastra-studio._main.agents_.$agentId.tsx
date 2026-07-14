import { createFileRoute } from "@tanstack/react-router";
import { AgentRouteLayout } from "@/components/features/mastra-studio/router/studio-route-wrappers";
import { AgentCrumb } from "@/components/features/mastra-studio/upstream/domains/agents/agent-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId")({
  component: AgentRouteLayout,
  staticData: {
    handle: navHandleWithChildren("/agents", [
      { Component: AgentCrumb, heading: "Agent", id: "agent" },
    ]),
  },
});
