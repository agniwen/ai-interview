import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderSkillsView from "@/components/features/mastra-studio/upstream/pages/agent-builder/skills/view";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/skills/_edition/$id_/view",
)({ component: AgentBuilderSkillsView });
