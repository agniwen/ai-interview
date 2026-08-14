import { createFileRoute } from "@tanstack/react-router";
import Agent from "@/components/features/mastra-studio/upstream/pages/agents/agent";

function AgentSettingsRoute() {
  return <Agent view="settings" />;
}

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/settings")({
  component: AgentSettingsRoute,
});
