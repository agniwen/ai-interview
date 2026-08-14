import { createFileRoute } from "@tanstack/react-router";
import { EditLayoutWrapper } from "@/components/features/mastra-studio/upstream/pages/cms/agents/edit-layout";
import { AgentCrumb } from "@/components/features/mastra-studio/upstream/domains/agents/agent-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/agents/$agentId/edit")({
  component: EditLayoutWrapper,
  staticData: {
    handle: navHandleWithChildren("/agents", [
      { Component: AgentCrumb, heading: "Agent", id: "agent" },
    ]),
  },
});
