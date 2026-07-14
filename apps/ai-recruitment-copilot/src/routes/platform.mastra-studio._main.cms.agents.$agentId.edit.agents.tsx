import { createFileRoute } from "@tanstack/react-router";
import CmsAgentAgentsPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/agents";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/agents",
)({ component: CmsAgentAgentsPage });
