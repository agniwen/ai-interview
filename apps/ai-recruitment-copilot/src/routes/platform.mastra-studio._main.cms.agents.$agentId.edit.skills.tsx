import { createFileRoute } from "@tanstack/react-router";
import CmsAgentSkillsPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/skills";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/$agentId/edit/skills",
)({ component: CmsAgentSkillsPage });
