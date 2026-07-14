import { createFileRoute } from "@tanstack/react-router";
import AgentEvaluate from "@/components/features/mastra-studio/upstream/pages/agents/agent-evaluate";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/evaluate")({
  component: AgentEvaluate,
});
