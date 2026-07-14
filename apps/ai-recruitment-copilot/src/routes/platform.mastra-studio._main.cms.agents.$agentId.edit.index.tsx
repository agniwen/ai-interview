import { createFileRoute } from "@tanstack/react-router";
import CmsAgentInformationPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/information";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/agents/$agentId/edit/")({
  component: CmsAgentInformationPage,
});
