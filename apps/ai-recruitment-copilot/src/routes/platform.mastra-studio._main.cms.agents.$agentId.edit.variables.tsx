import { createFileRoute } from "@tanstack/react-router";
import CmsAgentVariablesPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/variables";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/variables",
)({ component: CmsAgentVariablesPage });
