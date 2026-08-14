import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderAgents from "@/components/features/mastra-studio/upstream/pages/agent-builder/agents";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/agents/_listing/")({
  component: AgentBuilderAgents,
});
