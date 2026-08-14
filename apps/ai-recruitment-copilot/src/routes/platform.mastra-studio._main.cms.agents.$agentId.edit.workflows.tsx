import { createFileRoute } from "@tanstack/react-router";
import CmsAgentWorkflowsPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/workflows";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/workflows",
)({ component: CmsAgentWorkflowsPage });
