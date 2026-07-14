import { createFileRoute } from "@tanstack/react-router";
import { StudioSettingsPage } from "@/components/features/mastra-studio/upstream/pages/settings";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/settings")({
  component: StudioSettingsPage,
  staticData: { handle: navHandle("/settings") },
});
