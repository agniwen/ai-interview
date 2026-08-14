import { createFileRoute } from "@tanstack/react-router";
import DatasetCompareDatasetVersions from "@/components/features/mastra-studio/upstream/pages/datasets/dataset/versions";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/datasets_/$datasetId_/versions",
)({
  component: DatasetCompareDatasetVersions,
  staticData: { handle: navHandle("/datasets") },
});
