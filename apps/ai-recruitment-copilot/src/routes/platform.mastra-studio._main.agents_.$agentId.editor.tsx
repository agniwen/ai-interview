import { createFileRoute } from "@tanstack/react-router";
import AgentPlayground from "@/components/features/mastra-studio/upstream/pages/agents/agent-playground";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/editor")({
  component: AgentPlayground,
});
