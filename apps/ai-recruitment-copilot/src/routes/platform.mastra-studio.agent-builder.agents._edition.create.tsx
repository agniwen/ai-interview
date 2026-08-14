import { createFileRoute } from "@tanstack/react-router";
import AgentBuilderCreate from "@/components/features/mastra-studio/upstream/pages/agent-builder/agents/create";

export const Route = createFileRoute(
  "/platform/mastra-studio/agent-builder/agents/_edition/create",
)({ component: AgentBuilderCreate });
