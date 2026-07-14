import { createFileRoute } from "@tanstack/react-router";
import CmsAgentInstructionBlocksPage from "@/components/features/mastra-studio/upstream/pages/cms/agents/instruction-blocks";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/cms/agents/create/instruction-blocks",
)({ component: CmsAgentInstructionBlocksPage });
