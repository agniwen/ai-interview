import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderLibrary from "@/components/features/mastra-studio/upstream/pages/agent-builder/library";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/library/")({
  component: AgentBuilderLibrary,
});
