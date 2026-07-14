import { createFileRoute } from "@tanstack/react-router";
import Resources from "@/components/features/mastra-studio/upstream/pages/resources";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/resources")({
  component: Resources,
  staticData: { handle: navHandle("/resources") },
});
