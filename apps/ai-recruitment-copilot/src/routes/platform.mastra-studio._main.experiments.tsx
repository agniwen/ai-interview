import { createFileRoute } from "@tanstack/react-router";
import Experiments from "@/components/features/mastra-studio/upstream/pages/experiments";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/experiments")({
  component: Experiments,
  staticData: { handle: navHandle("/experiments") },
});
