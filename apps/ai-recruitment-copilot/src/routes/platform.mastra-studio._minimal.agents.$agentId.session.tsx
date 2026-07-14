import { createFileRoute } from "@tanstack/react-router";
import AgentSession from "@/components/features/mastra-studio/upstream/pages/agents/agent/session";

export const Route = createFileRoute("/platform/mastra-studio/_minimal/agents/$agentId/session")({
  component: AgentSession,
});
