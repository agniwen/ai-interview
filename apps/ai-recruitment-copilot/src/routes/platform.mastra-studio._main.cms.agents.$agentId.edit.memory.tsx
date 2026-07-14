import { createFileRoute } from "@tanstack/react-router";
import CmsAgentMemoryPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/memory";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/memory",
)({ component: CmsAgentMemoryPage });
