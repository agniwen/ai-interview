import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderEditionLayout } from "@/components/features/mastra-studio/upstream/domains/agent-builder/layouts/agent-builder-layout";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/skills/_edition")({
  component: AgentBuilderEditionLayout,
});
