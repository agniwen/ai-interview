import { createFileRoute } from "@tanstack/react-router";
import Tools from "@/components/features/mastra-studio/upstream/pages/tools";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/tools")({
  component: Tools,
  staticData: { handle: navHandle("/tools") },
});
