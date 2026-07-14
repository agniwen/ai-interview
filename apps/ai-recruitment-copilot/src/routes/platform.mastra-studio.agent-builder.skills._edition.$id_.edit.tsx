import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderSkillsEdit from "@/components/features/mastra-studio/upstream/pages/agent-builder/skills/edit";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/skills/_edition/$id_/edit",
)({ component: AgentBuilderSkillsEdit });
