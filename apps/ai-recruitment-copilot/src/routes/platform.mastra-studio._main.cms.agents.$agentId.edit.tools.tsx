import { createFileRoute } from "@tanstack/react-router";
import CmsAgentToolsPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/tools";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/tools",
)({ component: CmsAgentToolsPage });
