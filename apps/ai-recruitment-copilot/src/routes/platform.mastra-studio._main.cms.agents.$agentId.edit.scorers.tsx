import { createFileRoute } from "@tanstack/react-router";
import CmsAgentScorersPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/scorers";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/scorers",
)({ component: CmsAgentScorersPage });
