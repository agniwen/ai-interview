import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderAgentView from "@/components/features/mastra-studio/upstream/pages/agent-builder/agents/view";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/agents/_edition/$id_/view",
)({ component: AgentBuilderAgentView });
