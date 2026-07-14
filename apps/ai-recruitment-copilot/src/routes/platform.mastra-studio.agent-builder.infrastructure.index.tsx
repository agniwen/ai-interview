import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderInfrastructure from "@/components/features/mastra-studio/upstream/pages/agent-builder/infrastructure";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/infrastructure/")({
  component: AgentBuilderInfrastructure,
});
