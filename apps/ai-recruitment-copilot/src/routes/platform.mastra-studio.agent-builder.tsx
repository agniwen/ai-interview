import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderRouteRoot } from "@/components/features/mastra-studio/router/studio-agent-builder-layouts";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder")({
  component: AgentBuilderRouteRoot,
});
