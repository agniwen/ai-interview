import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderSkills from "@/components/features/mastra-studio/upstream/pages/agent-builder/skills";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/skills/_listing/")({
  component: AgentBuilderSkills,
});
