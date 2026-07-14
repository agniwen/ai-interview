import { createFileRoute } from "@tanstack/react-router";
import AgentTraces from "@/components/features/mastra-studio/upstream/pages/agents/agent-traces";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/traces")({
  component: AgentTraces,
});
