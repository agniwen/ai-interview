import { createFileRoute } from "@tanstack/react-router";
import DatasetExperiment from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/experiment";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/datasets_/$datasetId_/experiments_/$experimentId",
)({
  component: DatasetExperiment,
  staticData: { handle: navHandle("/datasets") },
});
