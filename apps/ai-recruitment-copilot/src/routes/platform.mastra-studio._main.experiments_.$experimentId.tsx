import { createFileRoute } from "@tanstack/react-router";
import ExperimentPage from "@/components/features/mastra-studio/upstream/pages/experiments/experiment";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/experiments_/$experimentId")({
  component: ExperimentPage,
  staticData: { handle: navHandle("/experiments") },
});
