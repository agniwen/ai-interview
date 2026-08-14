import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderLayout } from "@/components/features/mastra-studio/upstream/domains/agent-builder/layouts/agent-builder-layout";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/agents/_listing")({
  component: AgentBuilderLayout,
});
