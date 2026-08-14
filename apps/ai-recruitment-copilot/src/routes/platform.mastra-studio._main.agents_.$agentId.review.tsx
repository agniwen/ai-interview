import { createFileRoute } from "@tanstack/react-router";
import AgentReview from "@/components/features/mastra-studio/upstream/pages/agents/agent-review";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/review")({
  component: AgentReview,
});
