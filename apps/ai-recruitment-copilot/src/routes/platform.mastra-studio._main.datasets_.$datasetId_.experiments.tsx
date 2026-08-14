import { createFileRoute } from "@tanstack/react-router";
import CompareDatasetExperimentsPage from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/experiments";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/datasets_/$datasetId_/experiments",
)({
  component: CompareDatasetExperimentsPage,
  staticData: { handle: navHandle("/datasets") },
});
