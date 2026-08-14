import { createFileRoute } from "@tanstack/react-router";
import Workspace from "@/components/features/mastra-studio/upstream/pages/workspace";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/workspaces")({
  component: Workspace,
  staticData: { handle: navHandle("/workspaces") },
});
