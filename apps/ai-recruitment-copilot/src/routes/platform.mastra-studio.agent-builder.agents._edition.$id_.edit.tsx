import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderAgentEdit from "@/components/features/mastra-studio/upstream/pages/agent-builder/agents/edit";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/agents/_edition/$id_/edit",
)({ component: AgentBuilderAgentEdit });
