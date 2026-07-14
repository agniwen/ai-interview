import { createFileRoute } from "@tanstack/react-router";
import Agent from "@/components/features/mastra-studio/upstream/pages/agents/agent";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/chat")({
  component: Agent,
});
