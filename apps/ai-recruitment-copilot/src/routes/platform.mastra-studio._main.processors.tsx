import { createFileRoute } from "@tanstack/react-router";
import { Processors } from "@/components/features/mastra-studio/upstream/pages/processors";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/processors")({
  component: Processors,
  staticData: { handle: navHandle("/processors") },
});
