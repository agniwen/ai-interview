import { createFileRoute } from "@tanstack/react-router";
import MCPs from "@/components/features/mastra-studio/upstream/pages/mcps";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/mcps")({
  component: MCPs,
  staticData: { handle: navHandle("/mcps") },
});
