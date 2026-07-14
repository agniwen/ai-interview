import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderRoot } from "@/components/features/mastra-studio/upstream/pages/agent-builder";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/")({
  component: AgentBuilderRoot,
});
