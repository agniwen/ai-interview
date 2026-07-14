import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderSkillsCreate from "@/components/features/mastra-studio/upstream/pages/agent-builder/skills/create";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/skills/_edition/create",
)({ component: AgentBuilderSkillsCreate });
