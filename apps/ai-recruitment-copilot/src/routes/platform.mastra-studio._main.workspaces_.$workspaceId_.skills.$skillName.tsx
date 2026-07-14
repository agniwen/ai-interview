import { createFileRoute } from "@tanstack/react-router";
import WorkspaceSkillDetailPage from "@/components/features/mastra-studio/upstream/pages/workspace/skills/[skillName]";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/workspaces_/$workspaceId_/skills/$skillName",
)({
  component: WorkspaceSkillDetailPage,
  staticData: { handle: navHandle("/workspaces") },
});
